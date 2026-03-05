/**
 * Shared configuration for all scripts in this directory.
 *
 * Edit the constants below to control which images are tested, which
 * thresholds are used, and whether matched images are saved to disk.
 * All scripts import from this file so changes apply everywhere at once.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { HashSize } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, ".image-cache");

/**
 * When true, the tuning-helper script saves every test image that matched
 * a placeholder into `scripts/placeholder-match/<HashSize>/` for visual
 * inspection. The folder is wiped at the start of each run.
 */
export const SAVE_MATCHES = true;

/**
 * Per-hash-size threshold overrides. Set a value to override the built-in
 * default for that hash size. Leave a key absent (or the whole object empty)
 * to fall back to the preset's default threshold.
 *
 * Defaults: BIT_64 = 10, BIT_128 = 20, BIT_256 = 40
 */
export const THRESHOLDS: Partial<Record<HashSize, number>> = {
  // [HashSize.BIT_64]: 10,
  // [HashSize.BIT_128]: 20,
  // [HashSize.BIT_256]: 40,
};

/**
 * Fetches a URL and validates that the response is a decodable image.
 *
 * Checks HTTP status, Content-Type header, and runs the buffer through
 * sharp to ensure it can actually be processed.
 */
export async function fetchImage(url: string): Promise<Buffer> {
  const key = createHash("sha256").update(url).digest("hex");
  const cachePath = join(CACHE_DIR, key);

  if (existsSync(cachePath)) {
    console.log(`  [cache hit] ${shortName(url)}`);
    return readFileSync(cachePath);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Not an image (content-type: ${contentType})`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).metadata();

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, buf);
  console.log(`  [fetched]   ${shortName(url)}`);

  return buf;
}

/** Extracts a human-readable filename from a URL (strips query params). */
function shortName(url: string): string {
  return url.split("/").pop()!.split("?")[0];
}

/** Known placeholder image URLs used as the reference set. */
export const PLACEHOLDER_URLS: Array<string> = [];

/** Test image URLs to compare against the placeholders. */
export const TEST_URLS: Array<string> = [];
