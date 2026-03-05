const HASH_HEX_PATTERN = /^[0-9a-fA-F]{16}$/;

export function hammingDistance(a: string, b: string): number {
  if (!HASH_HEX_PATTERN.test(a) || !HASH_HEX_PATTERN.test(b)) {
    throw new TypeError("Hashes must be 16-character hexadecimal strings");
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
