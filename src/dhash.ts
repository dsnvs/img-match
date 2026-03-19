import sharp from "sharp";
import { DEFAULT_HASH_SIZE, HashSize } from "./hash-size.js";

export interface ComputeDHashOptions {
  hashSize?: HashSize;
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

  switch (hashSize) {
    // Grid is (cols+1) × rows so that column-wise comparisons produce
    // exactly cols × rows = bitLength bits.
    case HashSize.BIT_64:
      return computeHorizontalDHash(buffer, 9, 8);
    case HashSize.BIT_128: {
      // Concatenate horizontal and vertical hashes (64 bits each) to
      // capture gradient information in both directions.
      const [h, v] = await Promise.all([
        computeHorizontalDHash(buffer, 9, 8),
        computeVerticalDHash(buffer, 8, 9),
      ]);
      return h + v;
    }
    case HashSize.BIT_256:
      return computeHorizontalDHash(buffer, 17, 16);
    default:
      throw new TypeError(`Unsupported hash size: ${hashSize}`);
  }
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
