export function hammingDistance(a: string, b: string): number {
  const x = BigInt("0x" + a);
  const y = BigInt("0x" + b);
  let xor = x ^ y;
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}
