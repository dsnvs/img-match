import { computeDHash } from "./dhash.js";
import { hammingDistance } from "./hamming.js";
import {
  DEFAULT_HASH_SIZE,
  type HashSize,
  getHashPreset,
} from "./hash-size.js";

export interface DetectorOptions {
  threshold?: number;
  concurrency?: number;
  hashSize?: HashSize;
}

export interface PlaceholderResult {
  isPlaceholder: boolean;
  confidence: number;
  matchedPlaceholder: string | null;
  distance: number;
  error?: string;
}

interface RegisteredPlaceholder {
  label: string;
  hash: string;
}

export class PlaceholderDetector {
  private placeholders: RegisteredPlaceholder[] = [];
  private threshold: number;
  private concurrency: number;
  private hashSize: HashSize;
  private bitLength: number;

  constructor(options: DetectorOptions = {}) {
    const hashSize = options.hashSize ?? DEFAULT_HASH_SIZE;
    const preset = getHashPreset(hashSize);

    const threshold = options.threshold ?? preset.defaultThreshold;
    if (
      !Number.isInteger(threshold) ||
      threshold < 0 ||
      threshold > preset.bitLength
    ) {
      throw new RangeError(
        `\`threshold\` must be an integer between 0 and ${preset.bitLength}`,
      );
    }

    const concurrency = options.concurrency ?? 8;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError("`concurrency` must be a positive integer");
    }

    this.threshold = threshold;
    this.concurrency = concurrency;
    this.hashSize = hashSize;
    this.bitLength = preset.bitLength;
  }

  async addPlaceholder(imageUrl: string, label: string): Promise<void> {
    const buffer = await this.fetchImage(imageUrl);
    const hash = await computeDHash(buffer, { hashSize: this.hashSize });
    const existing = this.placeholders.findIndex((p) => p.label === label);
    if (existing !== -1) {
      this.placeholders[existing] = { label, hash };
    } else {
      this.placeholders.push({ label, hash });
    }
  }

  async isPlaceholder(imageUrl: string): Promise<PlaceholderResult> {
    if (this.placeholders.length === 0) {
      return this.createNoMatchResult();
    }

    const buffer = await this.fetchImage(imageUrl);
    const hash = await computeDHash(buffer, { hashSize: this.hashSize });
    return this.compare(hash);
  }

  async checkMany(imageUrls: string[]): Promise<PlaceholderResult[]> {
    if (this.placeholders.length === 0) {
      return imageUrls.map(() => this.createNoMatchResult());
    }

    const results: PlaceholderResult[] = [];
    for (let i = 0; i < imageUrls.length; i += this.concurrency) {
      const batch = imageUrls.slice(i, i + this.concurrency);
      const batchResults = await Promise.allSettled(
        batch.map((url) => this.isPlaceholder(url)),
      );
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
          continue;
        }

        results.push({
          isPlaceholder: false,
          confidence: 0,
          matchedPlaceholder: null,
          distance: this.bitLength,
          error: toErrorMessage(result.reason),
        });
      }
    }
    return results;
  }

  private compare(hash: string): PlaceholderResult {
    if (this.placeholders.length === 0) {
      return this.createNoMatchResult();
    }

    let bestDistance = Infinity;
    let bestLabel: string | null = null;

    for (const placeholder of this.placeholders) {
      const dist = hammingDistance(hash, placeholder.hash);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestLabel = placeholder.label;
      }
      if (dist === 0) break;
    }

    const isMatch = bestDistance <= this.threshold;
    return {
      isPlaceholder: isMatch,
      confidence: 1 - bestDistance / this.bitLength,
      matchedPlaceholder: isMatch ? bestLabel : null,
      distance: bestDistance,
    };
  }

  private createNoMatchResult(): PlaceholderResult {
    return {
      isPlaceholder: false,
      confidence: 0,
      matchedPlaceholder: null,
      distance: this.bitLength,
    };
  }

  private async fetchImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image: ${response.status} ${response.statusText}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
