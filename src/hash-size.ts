/**
 * Supported hash size presets for perceptual hashing.
 *
 * Choose the smallest preset that reliably separates your placeholders
 * from real images — `BIT_64` is sufficient for most placeholder-detection
 * workloads. Larger presets increase discrimination at the cost of slightly
 * higher computation.
 */
export enum HashSize {
  /** 64-bit horizontal dHash (9×8 grid). Fast, recommended default. */
  BIT_64 = "BIT_64",
  /** 128-bit combined horizontal + vertical dHash. Better accuracy when images share similar horizontal patterns. */
  BIT_128 = "BIT_128",
  /** 256-bit horizontal dHash (17×16 grid). Maximum discrimination for large placeholder sets. */
  BIT_256 = "BIT_256",
}

export const DEFAULT_HASH_SIZE = HashSize.BIT_64;

export interface HashPreset {
  readonly bitLength: number;
  readonly hexLength: number;
  readonly defaultThreshold: number;
}

const PRESETS: Record<HashSize, Readonly<HashPreset>> = {
  [HashSize.BIT_64]: Object.freeze({ bitLength: 64, hexLength: 16, defaultThreshold: 10 }),
  [HashSize.BIT_128]: Object.freeze({ bitLength: 128, hexLength: 32, defaultThreshold: 20 }),
  [HashSize.BIT_256]: Object.freeze({ bitLength: 256, hexLength: 64, defaultThreshold: 40 }),
};

export function getHashPreset(hashSize: HashSize): HashPreset {
  const preset = PRESETS[hashSize as HashSize];
  if (!preset) {
    throw new RangeError("`hashSize` must be one of: BIT_64, BIT_128, BIT_256");
  }
  return preset;
}
