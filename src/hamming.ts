const SUPPORTED_LENGTHS = new Set([16, 32, 64]);
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

export function hammingDistance(a: string, b: string): number {
  if (
    !HEX_PATTERN.test(a) ||
    !HEX_PATTERN.test(b) ||
    !SUPPORTED_LENGTHS.has(a.length) ||
    !SUPPORTED_LENGTHS.has(b.length)
  ) {
    throw new TypeError(
      "Hashes must be hexadecimal strings of 16, 32, or 64 characters",
    );
  }

  if (a.length !== b.length) {
    throw new TypeError("Hashes must have the same length");
  }

  const x = BigInt("0x" + a);
  const y = BigInt("0x" + b);
  let xor = x ^ y;
  let count = 0;
  while (xor > 0n) {
    xor &= xor - 1n;
    count++;
  }
  return count;
}
