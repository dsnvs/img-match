/**
 * Placeholder cross-match — verifies that all registered placeholders
 * match each other at every hash size.
 *
 * Outputs an N x N matrix per hash size showing the hamming distance,
 * confidence percentage, and MATCH/NO status for each pair. This is
 * useful for confirming that visually similar placeholder images
 * (e.g. different sizes or variants of the same placeholder graphic)
 * are close enough in hash space to be treated as equivalent.
 *
 * Requires at least 2 placeholder URLs in urls.ts.
 *
 * Usage: npx tsx scripts/placeholder-cross-match.ts
 */


import {
  computeDHash,
  hammingDistance,
  HashSize,
  getHashPreset,
} from "../src/index.js";
import { PLACEHOLDER_URLS, THRESHOLDS, fetchImage } from "./variables.js";

const HASH_SIZES = [HashSize.BIT_64, HashSize.BIT_128, HashSize.BIT_256];

/** Extracts a human-readable filename from a URL (strips query params). */
function shortName(url: string): string {
  return url.split("/").pop()!.split("?")[0];
}

async function main() {
  console.log("\n  Fetching placeholders...");
  const results = await Promise.allSettled(
    PLACEHOLDER_URLS.map(async (url) => ({ name: shortName(url), buf: await fetchImage(url) })),
  );
  const placeholders: { name: string; buf: Buffer }[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const name = shortName(PLACEHOLDER_URLS[i]);
    if (r.status === "fulfilled") {
      placeholders.push(r.value);
    } else {
      console.error(`  SKIP ${name}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    }
  }
  if (placeholders.length < 2) {
    console.error("\n  Need at least 2 valid placeholders for cross-matching. Exiting.");
    process.exit(1);
  }
  console.log(`  Loaded ${placeholders.length} placeholders\n`);

  for (const hashSize of HASH_SIZES) {
    const preset = getHashPreset(hashSize);

    // Compute hashes for all placeholders
    const hashes: { name: string; hash: string }[] = [];
    for (const ph of placeholders) {
      const hash = await computeDHash(ph.buf, { hashSize });
      hashes.push({ name: ph.name, hash });
    }

    console.log(`${"=".repeat(80)}`);
    const threshold = THRESHOLDS[hashSize] ?? preset.defaultThreshold;

    console.log(`  ${hashSize} (${preset.bitLength}-bit, threshold: ${threshold})\n`);

    for (const h of hashes) {
      console.log(`  ${h.name}`);
      console.log(`  ${h.hash}\n`);
    }

    // Print N x N cross-match matrix
    const nameWidth = Math.max(...hashes.map((h) => h.name.length), 5);
    const colWidth = Math.max(nameWidth, 5);
    const rowLabel = "".padEnd(nameWidth);
    const headerCells = hashes.map((h) => h.name.slice(0, colWidth).padEnd(colWidth));
    console.log(`  ${rowLabel} | ${headerCells.join(" | ")}`);
    console.log(`  ${"-".repeat(nameWidth)}-+-${hashes.map(() => "-".repeat(colWidth)).join("-+-")}`);

    for (let i = 0; i < hashes.length; i++) {
      const cells: string[] = [];
      for (let j = 0; j < hashes.length; j++) {
        if (i === j) {
          cells.push("-".padEnd(colWidth));
        } else {
          const dist = hammingDistance(hashes[i].hash, hashes[j].hash);
          const conf = ((1 - dist / preset.bitLength) * 100).toFixed(1);
          const match = dist <= threshold ? "MATCH" : "NO";
          cells.push(`${dist} (${conf}%) ${match}`.padEnd(colWidth));
        }
      }
      console.log(`  ${hashes[i].name.padEnd(nameWidth)} | ${cells.join(" | ")}`);
    }

    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
