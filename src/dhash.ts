import sharp from "sharp";

export async function computeDHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .greyscale()
    .resize(9, 8, { fit: "fill", kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = BigInt(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      if (left > right) {
        hash |= BigInt(1) << BigInt(y * 8 + x);
      }
    }
  }

  return hash.toString(16).padStart(16, "0");
}
