import { describe, expect, it } from "vitest";
import { DEFAULT_HASH_SIZE, HashSize, getHashPreset } from "./hash-size.js";

describe("hash presets", () => {
  it("uses BIT_64 as the initial default", () => {
    expect(DEFAULT_HASH_SIZE).toBe(HashSize.BIT_64);
  });

  it("returns correct metadata for BIT_64", () => {
    expect(getHashPreset(HashSize.BIT_64)).toEqual({
      bitLength: 64,
      hexLength: 16,
      defaultThreshold: 10,
    });
  });

  it("returns correct metadata for BIT_128", () => {
    expect(getHashPreset(HashSize.BIT_128)).toEqual({
      bitLength: 128,
      hexLength: 32,
      defaultThreshold: 20,
    });
  });

  it("returns correct metadata for BIT_256", () => {
    expect(getHashPreset(HashSize.BIT_256)).toEqual({
      bitLength: 256,
      hexLength: 64,
      defaultThreshold: 40,
    });
  });

  it("returns correct metadata for BIT_512", () => {
    expect(getHashPreset(HashSize.BIT_512)).toEqual({
      bitLength: 512,
      hexLength: 128,
      defaultThreshold: 80,
    });
  });
});
