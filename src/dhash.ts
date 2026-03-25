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
    case HashSize.BIT_64:
      return computeHorizontalDHash(buffer, 9, 8);
    case HashSize.BIT_128:
      return computeCombinedDHash(buffer, 8);
    case HashSize.BIT_256:
      return computeHorizontalDHash(buffer, 17, 16);
    case HashSize.BIT_512:
      return computeCombinedDHash(buffer, 16);
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

/**
 * Combined horizontal + vertical dHash on a single (size+1)×(size+1) grid,
 * matching Ben Hoyt's dhash library behaviour. Each direction yields size²
 * bits; the two halves are concatenated for 2×size² total bits.
 */
async function computeCombinedDHash(
  buffer: Buffer,
  size: number,
): Promise<string> {
  const gridSize = size + 1;
  const { data } = await sharp(buffer)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .greyscale()
    .resize(gridSize, gridSize, { fit: "fill", kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Horizontal: compare each pixel with its right neighbour.
  let hHash = BigInt(0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = data[y * gridSize + x];
      const right = data[y * gridSize + x + 1];
      if (left > right) {
        hHash |= BigInt(1) << BigInt(y * size + x);
      }
    }
  }

  // Vertical: compare each pixel with the one below.
  let vHash = BigInt(0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const top = data[y * gridSize + x];
      const bottom = data[(y + 1) * gridSize + x];
      if (top > bottom) {
        vHash |= BigInt(1) << BigInt(y * size + x);
      }
    }
  }

  const bits = size * size;
  const hexLen = Math.ceil(bits / 4);
  const hHex = hHash.toString(16).padStart(hexLen, "0");
  const vHex = vHash.toString(16).padStart(hexLen, "0");
  return hHex + vHex;
}
