# Scripts

Helper scripts for tuning and benchmarking `placeholder-detect`. All scripts run with [tsx](https://github.com/privatenumber/tsx):

```sh
npx tsx scripts/<script-name>.ts
```

## Image cache

Fetched images are cached locally in `scripts/.image-cache/` (gitignored) so that repeated runs don't re-download. To clear the cache, delete the folder:

```sh
rm -rf scripts/.image-cache
```

## Configuration — `variables.ts`

Shared configuration file imported by all scripts. Edit this single file to change what gets tested:

| Export | Description |
|---|---|
| `PLACEHOLDER_URLS` | Reference placeholder image URLs. These are the "known placeholders" that test images are compared against. |
| `TEST_URLS` | Image URLs to check against the placeholders. |
| `THRESHOLDS` | Per-hash-size threshold overrides. Leave empty to use defaults (BIT_64: 10, BIT_128: 20, BIT_256: 40). |
| `SAVE_MATCHES` | When `true`, the tuning helper saves matched and non-matching test images to disk for visual review. |
| `fetchImage()` | Shared fetch utility that validates HTTP status, content-type, and image decodability. |

## Finding Your Ideal Parameters

Follow these steps to find the best hash size and threshold for your dataset.

### 1. Set up your images

In `variables.ts`, add your known placeholder image URLs to `PLACEHOLDER_URLS` and a representative sample of real product/item images (including some that are placeholders) to `TEST_URLS`. Set `SAVE_MATCHES = true`.

### 2. Run the tuning helper

```sh
npx tsx scripts/tuning-helper.ts
```

The output shows a table for each hash size (BIT_64, BIT_128, BIT_256). For each test image you'll see its **distance** to the closest placeholder and a **confidence** percentage.

### 3. Check the results

- **Transform tests** should all show `MATCH`. If a placeholder's resize or padding variant doesn't match itself, that hash size may not be robust enough for your images.
- **Test URLs** — look for two kinds of errors:
  - **False positives** (non-placeholder images marked `MATCH`): check `placeholder-match/<HashSize>/` for images that shouldn't be there.
  - **False negatives** (placeholder images marked `NO MATCH`): check `placeholder-miss/<HashSize>/` for placeholders that were missed.

### 4. Adjust the threshold

If you see false positives, lower the threshold. If you see false negatives, raise it. Set per-hash-size overrides in the `THRESHOLDS` object in `variables.ts` and re-run until both folders look correct.

### 5. Pick a hash size

- **BIT_64** — fastest, works well for most cases.
- **BIT_128** — better when placeholders share similar horizontal patterns.
- **BIT_256** — most precise, best for large or detailed placeholder sets.

Choose the smallest hash size where your results are clean (no false positives or negatives). If multiple hash sizes work, prefer BIT_64 for speed.

## Scripts

### `tuning-helper.ts`

The primary tool for finding the right hash size and threshold for your dataset.

For each hash size (BIT_64, BIT_128, BIT_256) it:

1. **Transform tests** — Resizes and pads each placeholder, then checks if the transformed version still matches the original. Validates that the hash is robust to common image transformations.
2. **Test URL comparisons** — Hashes every test image and compares it against all placeholders, reporting distance, confidence, per-image timing, and the closest matching placeholder.

All images are pre-fetched once so timings reflect pure hash + compare cost.

When `SAVE_MATCHES = true`, matched images are saved to `scripts/placeholder-match/<HashSize>/` and non-matching images to `scripts/placeholder-miss/<HashSize>/` for visual inspection. Both folders are wiped on each run.

```sh
npx tsx scripts/tuning-helper.ts
```

### `placeholder-cross-match.ts`

Verifies that all registered placeholders match **each other** at every hash size. Outputs an N x N distance matrix showing the hamming distance, confidence, and match status for each pair.

Useful for confirming that different placeholder variants (e.g. different sizes or crops of the same graphic) are close enough in hash space to be treated as equivalent.

Requires at least 2 placeholder URLs.

```sh
npx tsx scripts/placeholder-cross-match.ts
```

### `benchmark.ts`

Measures raw hashing + comparison throughput with network removed from the equation. All images are cached in memory before timing begins.

Outputs a summary table with total time, average time per image, and match count for each hash size. Placeholder hashing is excluded from timing since it would be a one-time startup cost.

```sh
npx tsx scripts/benchmark.ts
```
