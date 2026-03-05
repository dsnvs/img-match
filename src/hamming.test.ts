import { describe, it, expect } from "vitest";
import { hammingDistance } from "./hamming.js";

describe("hammingDistance", () => {
  it("returns 0 for identical hashes", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("ffffffffffffffff", "ffffffffffffffff")).toBe(0);
    expect(hammingDistance("abcdef0123456789", "abcdef0123456789")).toBe(0);
  });

  it("returns 1 when a single bit differs", () => {
    expect(hammingDistance("0000000000000000", "0000000000000001")).toBe(1);
  });

  it("returns 64 for maximally different hashes", () => {
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("counts multiple differing bits correctly", () => {
    expect(hammingDistance("0000000000000000", "000000000000000f")).toBe(4);
  });

  it("is commutative", () => {
    const a = "abcdef0123456789";
    const b = "1234567890abcdef";
    expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
  });

  it("throws for invalid hash input", () => {
    expect(() => hammingDistance("xyz", "0000000000000000")).toThrow(/hexadecimal/);
    expect(() => hammingDistance("0000000000000000", "123")).toThrow(/hexadecimal/);
  });

  it("supports 32-character hashes", () => {
    expect(hammingDistance("0".repeat(32), "f".repeat(32))).toBe(128);
  });

  it("supports 64-character hashes", () => {
    expect(hammingDistance("0".repeat(64), "f".repeat(64))).toBe(256);
  });

  it("rejects mixed hash lengths", () => {
    expect(() => hammingDistance("0".repeat(16), "0".repeat(32))).toThrow(/same length/);
  });
});
