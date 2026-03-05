import { computeDHash } from "./dhash.js";
import { hammingDistance } from "./hamming.js";

export interface DetectorOptions {
  threshold?: number;
  concurrency?: number;
}

export interface PlaceholderResult {
  isPlaceholder: boolean;
  confidence: number;
  matchedPlaceholder: string | null;
  distance: number;
}

interface RegisteredPlaceholder {
  label: string;
  hash: string;
}

export class PlaceholderDetector {
  private placeholders: RegisteredPlaceholder[] = [];
  private threshold: number;
  private concurrency: number;

  constructor(options: DetectorOptions = {}) {
    this.threshold = options.threshold ?? 10;
    this.concurrency = options.concurrency ?? 8;
  }

  async addPlaceholder(imageUrl: string, label: string): Promise<void> {
    const buffer = await this.fetchImage(imageUrl);
    const hash = await computeDHash(buffer);
    this.placeholders.push({ label, hash });
  }

  async isPlaceholder(imageUrl: string): Promise<PlaceholderResult> {
    const buffer = await this.fetchImage(imageUrl);
    const hash = await computeDHash(buffer);
    return this.compare(hash);
  }

  async checkMany(imageUrls: string[]): Promise<PlaceholderResult[]> {
    const results: PlaceholderResult[] = [];
    for (let i = 0; i < imageUrls.length; i += this.concurrency) {
      const batch = imageUrls.slice(i, i + this.concurrency);
      const batchResults = await Promise.all(
        batch.map((url) => this.isPlaceholder(url)),
      );
      results.push(...batchResults);
    }
    return results;
  }

  private compare(hash: string): PlaceholderResult {
    if (this.placeholders.length === 0) {
      return { isPlaceholder: false, confidence: 0, matchedPlaceholder: null, distance: 64 };
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
      confidence: 1 - bestDistance / 64,
      matchedPlaceholder: isMatch ? bestLabel : null,
      distance: bestDistance,
    };
  }

  private async fetchImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
