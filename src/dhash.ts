import sharp from "sharp";
import { DEFAULT_HASH_SIZE, HashSize } from "./hash-size.js";

export interface ProbeSize {
  width: number;
  height: number;
}

export interface ComputeDHashOptions {
  hashSize?: HashSize;
  trimWhitespace?: boolean;
  probeSize?: ProbeSize;
}

/**
 * Compute a difference hash (dHash) for the given image buffer.
 *
 * dHash works by down-sampling the image to a small grid and comparing
 * adjacent pixel intensities. Each comparison yields one bit: 1 if the
 * left (or top) pixel is brighter, 0 otherwise. The resulting bit string
 * is compact and resilient to minor transformations like resizing or
 * compression.
 */
export async function computeDHash(
  buffer: Buffer,
  options?: ComputeDHashOptions,
): Promise<string> {
  const hashSize = options?.hashSize ?? DEFAULT_HASH_SIZE;
  const trimWhitespace = options?.trimWhitespace ?? true;
  const preparedBuffer = trimWhitespace
    ? await trimImageWhitespace(buffer, hashSize, options?.probeSize)
    : buffer;

  switch (hashSize) {
    // Grid is (cols+1) × rows so that column-wise comparisons produce
    // exactly cols × rows = bitLength bits.
    case HashSize.BIT_64:
      return computeHorizontalDHash(preparedBuffer, 9, 8);
    case HashSize.BIT_128: {
      // Concatenate horizontal and vertical hashes (64 bits each) to
      // capture gradient information in both directions.
      const [h, v] = await Promise.all([
        computeHorizontalDHash(preparedBuffer, 9, 8),
        computeVerticalDHash(preparedBuffer, 8, 9),
      ]);
      return h + v;
    }
    case HashSize.BIT_256:
      return computeHorizontalDHash(preparedBuffer, 17, 16);
    default:
      throw new TypeError(`Unsupported hash size: ${hashSize}`);
  }
}

interface ContentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface SourceSize {
  width: number;
  height: number;
}

interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getMinimumProbeSize(hashSize: HashSize): ProbeSize {
  switch (hashSize) {
    case HashSize.BIT_64:
      return { width: 9, height: 8 };
    case HashSize.BIT_128:
      return { width: 9, height: 9 };
    case HashSize.BIT_256:
      return { width: 17, height: 16 };
    default:
      throw new TypeError(`Unsupported hash size: ${hashSize}`);
  }
}

function getDefaultProbeSize(hashSize: HashSize): ProbeSize {
  const minimum = getMinimumProbeSize(hashSize);
  return { width: minimum.width * 4, height: minimum.height * 4 };
}

export function resolveTrimProbeSize(
  hashSize: HashSize,
  probeSize?: ProbeSize,
): ProbeSize {
  const minimumProbeSize = getMinimumProbeSize(hashSize);
  if (!probeSize) {
    return getDefaultProbeSize(hashSize);
  }

  return {
    width: validateProbeDimension(
      "width",
      probeSize.width,
      minimumProbeSize.width,
    ),
    height: validateProbeDimension(
      "height",
      probeSize.height,
      minimumProbeSize.height,
    ),
  };
}

function validateProbeDimension(
  axis: "width" | "height",
  value: number,
  minimum: number,
): number {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(
      `\`probeSize.${axis}\` must be an integer greater than or equal to ${minimum}`,
    );
  }

  return value;
}

function clampProbeSizeToSource(
  probeSize: ProbeSize,
  sourceSize: SourceSize,
): ProbeSize {
  return {
    width: Math.max(1, Math.floor(Math.min(probeSize.width, sourceSize.width))),
    height: Math.max(
      1,
      Math.floor(Math.min(probeSize.height, sourceSize.height)),
    ),
  };
}

function isWhitespacePixel(r: number, g: number, b: number, a: number): boolean {
  return a === 0 || (r === 255 && g === 255 && b === 255 && a === 255);
}

async function trimImageWhitespace(
  buffer: Buffer,
  hashSize: HashSize,
  probeSize?: ProbeSize,
): Promise<Buffer> {
  const image = sharp(buffer, { failOn: "none" });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    return buffer;
  }

  const resolvedProbeSize = resolveTrimProbeSize(hashSize, probeSize);
  const effectiveProbeSize = clampProbeSizeToSource(resolvedProbeSize, {
    width: metadata.width,
    height: metadata.height,
  });
  // Read metadata from the original image size and build the probe separately,
  // since resizing the probe would destroy the source dimensions needed for mapping.
  const { data } = await sharp(buffer, { failOn: "none" })
    .ensureAlpha()
    .resize(effectiveProbeSize.width, effectiveProbeSize.height, {
      fit: "fill",
      kernel: "nearest",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bounds = findContentBounds(
    data,
    effectiveProbeSize.width,
    effectiveProbeSize.height,
  );
  if (!bounds) {
    // All pixels are whitespace — return original to preserve distinct hashes
    // rather than collapsing to a canonical blank that erases real content.
    return buffer;
  }

  const crop = mapBoundsToSource(bounds, effectiveProbeSize, {
    width: metadata.width,
    height: metadata.height,
  });

  if (
    crop.left === 0 &&
    crop.top === 0 &&
    crop.width === metadata.width &&
    crop.height === metadata.height
  ) {
    return buffer;
  }

  return sharp(buffer, { failOn: "none" })
    .extract(crop)
    .png()
    .toBuffer();
}

function findContentBounds(
  data: Buffer,
  width: number,
  height: number,
): ContentBounds | null {
  const rowIsWhitespace = (y: number): boolean => {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (
        !isWhitespacePixel(
          data[offset],
          data[offset + 1],
          data[offset + 2],
          data[offset + 3],
        )
      ) {
        return false;
      }
    }
    return true;
  };

  const columnIsWhitespace = (x: number): boolean => {
    for (let y = 0; y < height; y++) {
      const offset = (y * width + x) * 4;
      if (
        !isWhitespacePixel(
          data[offset],
          data[offset + 1],
          data[offset + 2],
          data[offset + 3],
        )
      ) {
        return false;
      }
    }
    return true;
  };

  let top = 0;
  while (top < height && rowIsWhitespace(top)) {
    top++;
  }

  if (top === height) {
    return null;
  }

  let bottom = height - 1;
  while (bottom >= 0 && rowIsWhitespace(bottom)) {
    bottom--;
  }

  let left = 0;
  while (left < width && columnIsWhitespace(left)) {
    left++;
  }

  let right = width - 1;
  while (right >= 0 && columnIsWhitespace(right)) {
    right--;
  }

  return { left, top, right, bottom };
}

function mapBoundsToSource(
  bounds: ContentBounds,
  probeSize: ProbeSize,
  sourceSize: SourceSize,
): CropRect {
  const left = Math.max(
    0,
    Math.min(
      sourceSize.width - 1,
      Math.floor((bounds.left / probeSize.width) * sourceSize.width),
    ),
  );
  const top = Math.max(
    0,
    Math.min(
      sourceSize.height - 1,
      Math.floor((bounds.top / probeSize.height) * sourceSize.height),
    ),
  );
  const right = Math.max(
    left + 1,
    Math.min(
      sourceSize.width,
      Math.ceil(((bounds.right + 1) / probeSize.width) * sourceSize.width),
    ),
  );
  const bottom = Math.max(
    top + 1,
    Math.min(
      sourceSize.height,
      Math.ceil(((bounds.bottom + 1) / probeSize.height) * sourceSize.height),
    ),
  );

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

async function computeHorizontalDHash(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<string> {
  // Composite transparent pixels onto a black background so the hash is
  // deterministic regardless of alpha channel presence. Then convert to
  // greyscale and resize to the small grid. "nearest" interpolation keeps
  // sharp edges which makes hashes more stable for synthetic/placeholder images.
  const { data } = await sharp(buffer)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .greyscale()
    .resize(width, height, { fit: "fill", kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Compare each pixel with its right neighbour; set the bit if brighter.
  const cols = width - 1;
  let hash = BigInt(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < cols; x++) {
      const left = data[y * width + x];
      const right = data[y * width + x + 1];
      if (left > right) {
        hash |= BigInt(1) << BigInt(y * cols + x);
      }
    }
  }

  const bits = cols * height;
  const hexLen = Math.ceil(bits / 4);
  return hash.toString(16).padStart(hexLen, "0");
}

/** Same as horizontal dHash but compares each pixel with the one below. */
async function computeVerticalDHash(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<string> {
  const { data } = await sharp(buffer)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .greyscale()
    .resize(width, height, { fit: "fill", kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rows = height - 1;
  let hash = BigInt(0);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const top = data[y * width + x];
      const bottom = data[(y + 1) * width + x];
      if (top > bottom) {
        hash |= BigInt(1) << BigInt(y * width + x);
      }
    }
  }

  const bits = rows * width;
  const hexLen = Math.ceil(bits / 4);
  return hash.toString(16).padStart(hexLen, "0");
}
