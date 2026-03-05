import sharp from "sharp";
import { DEFAULT_HASH_SIZE, HashSize } from "./hash-size.js";

export interface ComputeDHashOptions {
  hashSize?: HashSize;
}

export async function computeDHash(
  buffer: Buffer,
  options?: ComputeDHashOptions,
): Promise<string> {
  const hashSize = options?.hashSize ?? DEFAULT_HASH_SIZE;

  switch (hashSize) {
    case HashSize.BIT_64:
      return computeHorizontalDHash(buffer, 9, 8);
    case HashSize.BIT_128: {
      const [h, v] = await Promise.all([
        computeHorizontalDHash(buffer, 9, 8),
        computeVerticalDHash(buffer, 8, 9),
      ]);
      return h + v;
    }
    case HashSize.BIT_256:
      return computeHorizontalDHash(buffer, 17, 16);
  }
}

async function computeHorizontalDHash(
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
