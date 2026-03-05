/**
 * Benchmark — measures raw hashing + comparison throughput per hash size.
 *
 * All images are pre-fetched into memory so that timing reflects only the
 * computeDHash + hammingDistance cost, not network latency. Placeholder
 * hashing is excluded from timing since it would be a one-time cost at
 * startup in production.
 *
 * Outputs a summary table with total time, average time per image,
 * and match count for each hash size.
 *
 * Usage: npx tsx scripts/benchmark.ts
 */

import { performance } from "node:perf_hooks";
import {
  computeDHash,
  hammingDistance,
  HashSize,
  getHashPreset,
} from "../src/index.js";
import { PLACEHOLDER_URLS, TEST_URLS, THRESHOLDS, fetchImage } from "./urls.js";

const HASH_SIZES = [HashSize.BIT_64, HashSize.BIT_128, HashSize.BIT_256];

/** Extracts a human-readable filename from a URL (strips query params). */
function shortName(url: string): string {
  return url.split("/").pop()!.split("?")[0];
}

interface CachedImage {
  name: string;
  buf: Buffer;
}

/** Finds the placeholder with the smallest hamming distance to the given hash. */
function findBestMatch(
  hash: string,
  placeholderHashes: { name: string; hash: string }[],
): { distance: number; matched: string } {
  let bestDistance = Infinity;
  let bestName = "";
  for (const ph of placeholderHashes) {
    const dist = hammingDistance(hash, ph.hash);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestName = ph.name;
    }
    if (dist === 0) break;
  }
  return { distance: bestDistance, matched: bestName };
}

async function main() {
  // --- Pre-fetch all images once ---

  console.log("\n  Fetching images...");
  const placeholderResults = await Promise.allSettled(
    PLACEHOLDER_URLS.map(async (url) => ({ name: shortName(url), buf: await fetchImage(url) })),
  );
  const placeholders: CachedImage[] = [];
  for (let i = 0; i < placeholderResults.length; i++) {
    const r = placeholderResults[i];
    const name = shortName(PLACEHOLDER_URLS[i]);
    if (r.status === "fulfilled") {
      placeholders.push(r.value);
    } else {
      console.error(`  SKIP placeholder ${name}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    }
  }
  if (placeholders.length === 0) {
    console.error("\n  No valid placeholders loaded. Exiting.");
    process.exit(1);
  }

  const testResults = await Promise.allSettled(
    TEST_URLS.map(async (url) => ({ name: shortName(url), buf: await fetchImage(url) })),
  );
  const testImages: CachedImage[] = [];
  const failedTests: string[] = [];
  for (let i = 0; i < testResults.length; i++) {
    const r = testResults[i];
    const name = shortName(TEST_URLS[i]);
    if (r.status === "fulfilled") {
      testImages.push(r.value);
    } else {
      failedTests.push(name);
      console.error(`  SKIP test image ${name}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    }
  }
  if (failedTests.length > 0) {
    console.log(`  Skipped ${failedTests.length} invalid test image(s)`);
  }

  console.log(`  Placeholders: ${placeholders.length}, Test images: ${testImages.length}\n`);

  // --- Benchmark each hash size ---

  const summaryRows: { hashSize: string; images: number; matches: number; totalMs: number; avgMs: number }[] = [];

  for (const hashSize of HASH_SIZES) {
    const preset = getHashPreset(hashSize);
    const threshold = THRESHOLDS[hashSize] ?? preset.defaultThreshold;

    // Hash placeholders (not timed — one-time startup cost)
    const placeholderHashes: { name: string; hash: string }[] = [];
    for (const ph of placeholders) {
      const hash = await computeDHash(ph.buf, { hashSize });
      placeholderHashes.push({ name: ph.name, hash });
    }

    // Timed: hash each test image + compare against all placeholders
    let matches = 0;
    const t0 = performance.now();
    for (const { buf } of testImages) {
      const hash = await computeDHash(buf, { hashSize });
      const best = findBestMatch(hash, placeholderHashes);
      if (best.distance <= threshold) matches++;
    }
    const totalMs = performance.now() - t0;
    const avgMs = totalMs / testImages.length;

    summaryRows.push({
      hashSize: `${hashSize} (${preset.bitLength}-bit)`,
      images: testImages.length,
      matches,
      totalMs,
      avgMs,
    });
  }

  // --- Print summary table ---

  const cols = [
    { label: "Hash Size", width: 22 },
    { label: "Images", width: 8 },
    { label: "Matches", width: 9 },
    { label: "Total", width: 10 },
    { label: "Avg/image", width: 10 },
  ];
  const header = cols.map((c) => c.label.padEnd(c.width)).join(" | ");
  const separator = cols.map((c) => "-".repeat(c.width)).join("-+-");

  console.log(`  ${separator}`);
  console.log(`  ${header}`);
  console.log(`  ${separator}`);

  for (const row of summaryRows) {
    const cells = [
      row.hashSize.padEnd(22),
      String(row.images).padStart(8),
      String(row.matches).padStart(9),
      `${row.totalMs.toFixed(1)}ms`.padStart(10),
      `${row.avgMs.toFixed(2)}ms`.padStart(10),
    ];
    console.log(`  ${cells.join(" | ")}`);
  }

  console.log(`  ${separator}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
