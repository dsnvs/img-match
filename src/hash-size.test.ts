import { describe, expect, it } from "vitest";
import { DEFAULT_HASH_SIZE, HashSize, getHashPreset } from "./hash-size.js";

describe("hash presets", () => {
  it("uses BIT_64 as the initial default", () => {
    expect(DEFAULT_HASH_SIZE).toBe(HashSize.BIT_64);
  });

  it("returns preset metadata for every supported size", () => {
    expect(getHashPreset(HashSize.BIT_64).hexLength).toBe(16);
    expect(getHashPreset(HashSize.BIT_128).hexLength).toBe(32);
    expect(getHashPreset(HashSize.BIT_256).hexLength).toBe(64);
  });
});
