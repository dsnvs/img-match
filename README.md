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
| `threshold` | `number` | `10` | Max Hamming distance to consider a match (integer from 0 to 64) |
| `concurrency` | `number` | `8` | Max concurrent image fetches in `checkMany` (positive integer) |

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

If an individual URL fails to fetch or decode, `checkMany` does not reject the whole call. Instead, that URL's result contains `isPlaceholder: false`, `confidence: 0`, `distance: 64`, and an `error` message.

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
  distance: number;             // raw Hamming distance (0-64)
  error?: string;               // present when checkMany could not process that URL
}
```

### Low-Level Utilities

These are exported for advanced use cases where you want to manage hashing and comparison yourself.

#### `computeDHash(buffer)`

Computes a 64-bit perceptual hash (dHash) from an image buffer.

```typescript
import { computeDHash } from "placeholder-detect";

const response = await fetch("https://cdn.example.com/image.png");
const buffer = Buffer.from(await response.arrayBuffer());
const hash = await computeDHash(buffer); // "a3f1b2c4d5e6f789"
```

#### `hammingDistance(a, b)`

Computes the Hamming distance between two 16-character hex hash strings.

Throws a `TypeError` if either hash is not a valid 16-character hexadecimal string.

```typescript
import { hammingDistance } from "placeholder-detect";

const dist = hammingDistance("a3f1b2c4d5e6f789", "a3f1b2c4d5e6f780");
// dist = 1 (one bit differs)
```

## How It Works

The package uses the [dHash](http://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html) (difference hash) algorithm:

1. Resize the image to 9x8 pixels using nearest-neighbor interpolation
2. Convert to grayscale
3. Compare each pixel to its right neighbor (8 comparisons per row, 8 rows = 64 bits)
4. Encode the result as a 16-character hex string

Two images are compared by counting the number of differing bits (Hamming distance). Identical images have distance 0. The default threshold of 10 means images with up to 10 differing bits (out of 64) are considered matches.

## Tuning the Threshold

The default threshold of `10` works well for most cases. If you need to adjust:

- **Lower threshold** (e.g., 5) = stricter matching, fewer false positives
- **Higher threshold** (e.g., 15) = looser matching, fewer false negatives
- Use the `confidence` and `distance` fields in the result to analyze your data and find the right value

## License

MIT
