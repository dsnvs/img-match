export enum HashSize {
  BIT_64 = "BIT_64",
  BIT_128 = "BIT_128",
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
  return PRESETS[hashSize];
}
