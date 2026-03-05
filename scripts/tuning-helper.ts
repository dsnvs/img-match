/**
 * Tuning helper — the main script for experimenting with placeholder detection settings.
 *
 * For each hash size (BIT_64, BIT_128, BIT_256), this script:
 *   1. Computes the dHash of each registered placeholder.
 *   2. Runs transform tests — resizes and centers each placeholder to verify
 *      the hash is robust to scaling and padding.
 *   3. Compares every test URL against all placeholders, reporting the closest
 *      match (lowest hamming distance).
 *
 * All images are fetched once at startup and cached in memory so that timing
 * reflects only hashing and comparison, not network latency.
 *
 * When SAVE_MATCHES is enabled in urls.ts, matched images are written to
 * scripts/placeholder-match/<HashSize>/ for visual inspection.
 *
 * Usage: npx tsx scripts/tuning-helper.ts
 */

import { performance } from "node:perf_hooks";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  computeDHash,
  hammingDistance,
  HashSize,
  getHashPreset,
} from "../src/index.js";
import { PLACEHOLDER_URLS, TEST_URLS, THRESHOLDS, SAVE_MATCHES, fetchImage } from "./variables.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MATCH_DIR = join(__dirname, "placeholder-match");
const MISS_DIR = join(__dirname, "placeholder-miss");

const HASH_SIZES = [HashSize.BIT_64, HashSize.BIT_128, HashSize.BIT_256];

/** Extracts a human-readable filename from a URL (strips query params). */
function shortName(url: string): string {
  return url.split("/").pop()!.split("?")[0];
}

interface Row {
  name: string;
  hash?: string;
  distance: number;
  matched?: string;
  timeMs: number;
  error?: string;
}

/** Prints a formatted table to stdout with configurable columns. */
function printTable(
  title: string,
  rows: Row[],
  opts: { showHash?: boolean; showMatched?: boolean; hashHexLen?: number; bitLength: number; threshold: number },
) {
  const showHash = opts.showHash ?? false;
  const showMatched = opts.showMatched ?? false;
  const hashWidth = Math.max(18, (opts.hashHexLen ?? 16) + 2);
  const cols = [
    { label: "Image", width: 40, align: "left" as const },
    ...(showHash ? [{ label: "Hash", width: hashWidth, align: "left" as const }] : []),
    { label: "Dist", width: 4, align: "right" as const },
    { label: "Conf", width: 7, align: "right" as const },
    { label: "Time", width: 8, align: "right" as const },
    { label: "Result", width: 10, align: "left" as const },
    ...(showMatched ? [{ label: "Matched", width: 30, align: "left" as const }] : []),
  ];

  const header = cols.map((c) => c.align === "right" ? c.label.padStart(c.width) : c.label.padEnd(c.width)).join(" | ");
  const separator = cols.map((c) => "-".repeat(c.width)).join("-+-");

  console.log(`\n  ${title}`);
  console.log(`  ${separator}`);
  console.log(`  ${header}`);
  console.log(`  ${separator}`);

  for (const row of rows) {
    const conf = `${((1 - row.distance / opts.bitLength) * 100).toFixed(1)}%`;
    const time = `${row.timeMs.toFixed(0)}ms`;
    const isMatch = !row.error && row.distance <= opts.threshold;
    const result = row.error ? `ERROR` : isMatch ? "MATCH" : "NO MATCH";
    const cells = [
      row.name.padEnd(40),
      ...(showHash ? [(row.hash ?? "").padEnd(hashWidth)] : []),
      String(row.distance).padStart(4),
      conf.padStart(7),
      time.padStart(8),
      result.padEnd(10),
      ...(showMatched ? [(isMatch && row.matched ? row.matched : "").padEnd(30)] : []),
    ];
    console.log(`  ${cells.join(" | ")}`);
  }

  console.log(`  ${separator}`);
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
  const hasMultiple = PLACEHOLDER_URLS.length > 1;

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

  // Build transform variants (resize + center on white canvas) for each placeholder
  const transforms: { placeholderName: string; variants: { name: string; buf: Buffer }[] }[] = [];
  for (const ph of placeholders) {
    const meta = await sharp(ph.buf).metadata();
    const w = meta.width ?? 400;
    const h = meta.height ?? 400;
    const resizeW = Math.round(w * 1.5);
    const resizeH = Math.round(h * 1.5);
    const padW = w + 200;
    const padH = h + 200;
    const offsetX = Math.round((padW - w) / 2);
    const offsetY = Math.round((padH - h) / 2);

    const resizedBuf = await sharp(ph.buf)
      .resize(resizeW, resizeH, { fit: "fill" })
      .png()
      .toBuffer();
    const centeredBuf = await sharp({
      create: { width: padW, height: padH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite([{ input: ph.buf, left: offsetX, top: offsetY }])
      .png()
      .toBuffer();

    transforms.push({
      placeholderName: ph.name,
      variants: [
        { name: `Resized to ${resizeW}x${resizeH}`, buf: resizedBuf },
        { name: `Centered in ${padW}x${padH} white`, buf: centeredBuf },
      ],
    });
  }

  console.log(`  Placeholders: ${placeholders.length}, Test images: ${testImages.length}`);

  // --- Prepare match output directory ---

  if (SAVE_MATCHES) {
    if (existsSync(MATCH_DIR)) {
      rmSync(MATCH_DIR, { recursive: true });
    }
    mkdirSync(MATCH_DIR, { recursive: true });
    if (existsSync(MISS_DIR)) {
      rmSync(MISS_DIR, { recursive: true });
    }
    mkdirSync(MISS_DIR, { recursive: true });
    console.log(`  Saving matches to ${MATCH_DIR}/`);
    console.log(`  Saving misses to ${MISS_DIR}/`);
  }

  // --- Run each hash size ---

  for (const hashSize of HASH_SIZES) {
    const preset = getHashPreset(hashSize);
    const threshold = THRESHOLDS[hashSize] ?? preset.defaultThreshold;
    const tableOpts = {
      bitLength: preset.bitLength,
      threshold,
      hashHexLen: preset.hexLength,
    };

    // Compute placeholder hashes
    const placeholderHashes: { name: string; hash: string }[] = [];
    for (const ph of placeholders) {
      const hash = await computeDHash(ph.buf, { hashSize });
      placeholderHashes.push({ name: ph.name, hash });
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`  ${hashSize} (${preset.bitLength}-bit, threshold: ${threshold})`);
    for (const ph of placeholderHashes) {
      console.log(`  Placeholder: ${ph.name}  =>  ${ph.hash}`);
    }

    // Transform tests — verifies hash stability under resize and padding
    const transformRows: Row[] = [];
    for (const group of transforms) {
      const refHash = placeholderHashes.find((p) => p.name === group.placeholderName)!;
      for (const variant of group.variants) {
        const t0 = performance.now();
        const hash = await computeDHash(variant.buf, { hashSize });
        const dist = hammingDistance(refHash.hash, hash);
        const elapsed = performance.now() - t0;
        const name = hasMultiple ? `${group.placeholderName} > ${variant.name}` : variant.name;
        transformRows.push({ name, hash, distance: dist, timeMs: elapsed });
      }
    }

    printTable("Transform tests", transformRows, { showHash: true, ...tableOpts });

    // Test URL comparisons — best match across all placeholders
    const testRows: Row[] = [];
    const matched: CachedImage[] = [];
    const missed: CachedImage[] = [];
    for (const { name, buf } of testImages) {
      const t0 = performance.now();
      const hash = await computeDHash(buf, { hashSize });
      const best = findBestMatch(hash, placeholderHashes);
      const elapsed = performance.now() - t0;
      testRows.push({ name, hash, distance: best.distance, matched: best.matched, timeMs: elapsed });
      if (best.distance <= threshold) {
        matched.push({ name, buf });
      } else {
        missed.push({ name, buf });
      }
    }

    printTable("Test URLs", testRows, { showHash: true, showMatched: hasMultiple, ...tableOpts });

    // Save matched images to disk for visual inspection
    if (SAVE_MATCHES && matched.length > 0) {
      const dir = join(MATCH_DIR, hashSize);
      mkdirSync(dir, { recursive: true });
      for (const { name, buf } of matched) {
        writeFileSync(join(dir, name), buf);
      }
      console.log(`\n  Saved ${matched.length} matched image(s) to ${dir}/`);
    }
    if (SAVE_MATCHES && missed.length > 0) {
      const dir = join(MISS_DIR, hashSize);
      mkdirSync(dir, { recursive: true });
      for (const { name, buf } of missed) {
        writeFileSync(join(dir, name), buf);
      }
      console.log(`  Saved ${missed.length} missed image(s) to ${dir}/`);
    }
  }

  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
