import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { computeDHash } from "./dhash.js";
import { hammingDistance } from "./hamming.js";
import { HashSize } from "./hash-size.js";

// Helper: create a solid-color image buffer
async function solidImage(r: number, g: number, b: number, size = 64): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r, g, b } },
  }).png().toBuffer();
}

// Helper: create a gradient image (left=bright, right=dark)
async function horizontalGradient(width = 64, height = 64): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = Math.round(((width - 1 - x) / (width - 1)) * 255);
      const idx = (y * width + x) * 3;
      pixels[idx] = val;
      pixels[idx + 1] = val;
      pixels[idx + 2] = val;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("computeDHash", () => {
  it("returns a 16-character hex string", async () => {
    const buf = await solidImage(128, 128, 128);
    const hash = await computeDHash(buf);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns consistent hash for the same image", async () => {
    const buf = await solidImage(255, 0, 0);
    const hash1 = await computeDHash(buf);
    const hash2 = await computeDHash(buf);
    expect(hash1).toBe(hash2);
  });

  it("returns all zeros for a solid-color image (no horizontal differences)", async () => {
    const buf = await solidImage(100, 100, 100);
    const hash = await computeDHash(buf);
    expect(hash).toBe("0000000000000000");
  });

  it("produces similar hashes for the same image at different resolutions", async () => {
    const small = await solidImage(200, 50, 50, 32);
    const large = await solidImage(200, 50, 50, 256);
    const hashSmall = await computeDHash(small);
    const hashLarge = await computeDHash(large);
    expect(hammingDistance(hashSmall, hashLarge)).toBe(0);
  });

  it("produces a non-zero hash for a gradient image", async () => {
    const buf = await horizontalGradient();
    const hash = await computeDHash(buf);
    expect(hash).not.toBe("0000000000000000");
  });

  it("produces different hashes for visually different images", async () => {
    const red = await solidImage(255, 0, 0);
    const gradient = await horizontalGradient();
    const hashRed = await computeDHash(red);
    const hashGradient = await computeDHash(gradient);
    expect(hashRed).not.toBe(hashGradient);
  });

  it("produces similar hashes for re-compressed images", async () => {
    const original = await horizontalGradient(128, 128);
    const recompressed = await sharp(original).jpeg({ quality: 50 }).toBuffer();
    const recompressedPng = await sharp(recompressed).png().toBuffer();
    const hashOriginal = await computeDHash(original);
    const hashRecompressed = await computeDHash(recompressedPng);
    expect(hammingDistance(hashOriginal, hashRecompressed)).toBeLessThanOrEqual(5);
  });

  it("returns a 16-character hex string for BIT_64 (default)", async () => {
    const buf = await solidImage(128, 128, 128);
    const hash = await computeDHash(buf, { hashSize: HashSize.BIT_64 });
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns a 32-character hex string for BIT_128", async () => {
    const buf = await solidImage(128, 128, 128);
    const hash = await computeDHash(buf, { hashSize: HashSize.BIT_128 });
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns a 64-character hex string for BIT_256", async () => {
    const buf = await solidImage(128, 128, 128);
    const hash = await computeDHash(buf, { hashSize: HashSize.BIT_256 });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces deterministic output for BIT_128", async () => {
    const buf = await horizontalGradient();
    const hash1 = await computeDHash(buf, { hashSize: HashSize.BIT_128 });
    const hash2 = await computeDHash(buf, { hashSize: HashSize.BIT_128 });
    expect(hash1).toBe(hash2);
  });

  it("produces deterministic output for BIT_256", async () => {
    const buf = await horizontalGradient();
    const hash1 = await computeDHash(buf, { hashSize: HashSize.BIT_256 });
    const hash2 = await computeDHash(buf, { hashSize: HashSize.BIT_256 });
    expect(hash1).toBe(hash2);
  });

  it("BIT_64 with options bag matches original no-options call", async () => {
    const buf = await horizontalGradient();
    const hashNoOpts = await computeDHash(buf);
    const hashWithOpts = await computeDHash(buf, { hashSize: HashSize.BIT_64 });
    expect(hashWithOpts).toBe(hashNoOpts);
  });
});
