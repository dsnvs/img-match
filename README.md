# placeholder-detect

Detect placeholder images in large datasets using perceptual hashing (dHash). Tolerant of resolution changes and compression artifacts.

## Install

```bash
npm install placeholder-detect
```

Requires Node.js 18+ and [Sharp](https://sharp.pixelplumbing.com/).

## Quick Start

```typescript
import { PlaceholderDetector } from "placeholder-detect";

const detector = new PlaceholderDetector();

// Register your known placeholder images
await detector.addPlaceholder("https://cdn.example.com/placeholder.png", "default");
await detector.addPlaceholder("https://cdn.example.com/coming-soon.png", "coming-soon");

// Check if an item image is a placeholder
const result = await detector.isPlaceholder("https://cdn.example.com/items/widget.png");

if (result.isPlaceholder) {
  console.log(`Matched placeholder: ${result.matchedPlaceholder}`);
  console.log(`Confidence: ${result.confidence}`);
}
```

## API

### `PlaceholderDetector`

#### `new PlaceholderDetector(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `hashSize` | `HashSize` | `HashSize.BIT_64` | Hash size preset (see [Hash Size Presets](#hash-size-presets)) |
| `threshold` | `number` | Preset default | Max Hamming distance to consider a match (integer from 0 to preset bit length) |
| `concurrency` | `number` | `8` | Max concurrent image fetches in `checkMany` (positive integer) |
| `trimWhitespace` | `boolean` | `true` | Trim exact opaque white and fully transparent edge whitespace before hashing |

Invalid option values throw a `RangeError`.

#### `detector.addPlaceholder(imageUrl, label)`

Fetches an image from the URL, computes its hash, and registers it with the given label.

```typescript
await detector.addPlaceholder("https://cdn.example.com/placeholder.png", "no-image");
```

#### `detector.isPlaceholder(imageUrl)`

Checks a single image against all registered placeholders. Returns a `PlaceholderResult`.

If no placeholders are registered, returns the standard non-match result without fetching the image.

Rejects if the image cannot be fetched or decoded.

```typescript
const result = await detector.isPlaceholder("https://cdn.example.com/items/widget.png");
```

#### `detector.checkMany(imageUrls)`

Checks multiple images concurrently, respecting the configured concurrency limit. Returns an array of `PlaceholderResult` in the same order as the input URLs.

If no placeholders are registered, returns one standard non-match result per URL without fetching any images.

If an individual URL fails to fetch or decode, `checkMany` does not reject the whole call. Instead, that URL's result contains `isPlaceholder: false`, `confidence: 0`, `distance: <preset max>`, and an `error` message.

```typescript
const results = await detector.checkMany([
  "https://cdn.example.com/items/widget.png",
  "https://cdn.example.com/items/gadget.png",
]);
```

### `PlaceholderResult`

```typescript
{
  isPlaceholder: boolean;       // true if distance <= threshold
  confidence: number;           // 0 to 1 (1 = exact match)
  matchedPlaceholder: string | null; // label of the matched placeholder, or null when no placeholder is within threshold
  distance: number;             // raw Hamming distance (0 to preset bit length)
  error?: string;               // present when checkMany could not process that URL
}
```

### Hash Size Presets

The `HashSize` enum controls the hash bit length used for comparison. The project default is `DEFAULT_HASH_SIZE` (`HashSize.BIT_64`).

```typescript
import { PlaceholderDetector, HashSize } from "placeholder-detect";

const detector = new PlaceholderDetector({ hashSize: HashSize.BIT_128 });
```

| Preset | Bit Length | Grid / Layout | Hex Length | Default Threshold | Purpose |
|--------|-----------|---------------|-----------|-------------------|---------|
| `BIT_64` | 64 | 9×8 horizontal | 16 | 10 | Fast placeholder detection — best for most use cases |
| `BIT_128` | 128 | Horizontal + vertical concat | 32 | 20 | Higher accuracy when images share similar horizontal patterns |
| `BIT_256` | 256 | 17×16 horizontal | 64 | 40 | Maximum discrimination for large or detailed placeholder sets |

### Low-Level Utilities

These are exported for advanced use cases where you want to manage hashing and comparison yourself.

#### `computeDHash(buffer, options?)`

Computes a perceptual hash (dHash) from an image buffer.

```typescript
import { computeDHash, HashSize } from "placeholder-detect";

const response = await fetch("https://cdn.example.com/image.png");
const buffer = Buffer.from(await response.arrayBuffer());

const hash64 = await computeDHash(buffer); // 16-char hex (default BIT_64)
const hash128 = await computeDHash(buffer, { hashSize: HashSize.BIT_128 }); // 32-char hex
const hash256 = await computeDHash(buffer, { hashSize: HashSize.BIT_256 }); // 64-char hex
const trimmedHash = await computeDHash(buffer, {
  hashSize: HashSize.BIT_64,
  trimWhitespace: true,
});
```

#### `hammingDistance(a, b)`

Computes the Hamming distance between two hex hash strings of the same length (16, 32, or 64 characters).

Throws a `TypeError` if either hash is not a valid hexadecimal string of a supported length, or if the two hashes have different lengths.

```typescript
import { hammingDistance } from "placeholder-detect";

const dist = hammingDistance("a3f1b2c4d5e6f789", "a3f1b2c4d5e6f780");
// dist = 1 (one bit differs)
```

## How It Works

The package uses the [dHash](http://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html) (difference hash) algorithm:

1. Resize the image to the preset grid size (e.g., 9×8 for BIT_64)
2. Convert to grayscale
3. Compare adjacent pixels (horizontal, vertical, or both depending on preset)
4. Encode the result as a hex string

Before hashing, the detector can trim edge bands made entirely of exact opaque white pixels (`255,255,255,255`) or fully transparent pixels (`alpha = 0`). After cropping, hashing still uses the standard grayscale dHash pipeline.

Two images are compared by counting the number of differing bits (Hamming distance). Identical images have distance 0. The default threshold varies by preset (e.g., 10 for BIT_64) and represents the maximum number of differing bits to consider a match.

## Tuning the Threshold

Each preset has a default threshold that works well for most cases. If you need to adjust:

- **Lower threshold** = stricter matching, fewer false positives
- **Higher threshold** = looser matching, fewer false negatives
- Use the `confidence` and `distance` fields in the result to analyze your data and find the right value

### Tuning Scripts

The `scripts/` directory contains helper tools for finding the ideal hash size and threshold for your dataset. All scripts run with [tsx](https://github.com/privatenumber/tsx) and share a single configuration file (`scripts/variables.ts`) where you set your placeholder URLs, test image URLs, and threshold overrides.

```bash
# Primary tuning tool — runs transform tests and compares test images against
# placeholders at every hash size, reporting distance, confidence, and timing.
# Set SAVE_MATCHES = true in variables.ts to save matched and non-matching
# images to disk for visual inspection.
npx tsx scripts/tuning-helper.ts

# Cross-match — verifies that all registered placeholders match each other
# at every hash size (requires at least 2 placeholder URLs).
npx tsx scripts/placeholder-cross-match.ts

# Benchmark — measures raw hashing + comparison throughput with network
# removed from the equation.
npx tsx scripts/benchmark.ts
```

See [`scripts/README.md`](scripts/README.md) for full details on configuration and each script.

## License

MIT
