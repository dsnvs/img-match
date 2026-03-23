import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import sharp from "sharp";
import { PlaceholderDetector } from "./detector.js";
import { HashSize } from "./hash-size.js";

// Test images served by local HTTP server
const images: Record<string, Buffer> = {};

async function makeImage(r: number, g: number, b: number, size = 64): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r, g, b } },
  }).png().toBuffer();
}

async function makeNoise(size = 64): Promise<Buffer> {
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const val = ((x * 37 + y * 73) % 256);
      const idx = (y * size + x) * 3;
      pixels[idx] = val;
      pixels[idx + 1] = (val + 80) % 256;
      pixels[idx + 2] = (val + 160) % 256;
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

async function makeGradient(width = 64, height = 64): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = Math.round(((width - 1 - x) / (width - 1)) * 255);
      const idx = (y * width + x) * 3;
      pixels[idx] = val;
      pixels[idx + 1] = val;
      pixels[idx + 2] = val;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function makeWhiteBorderImage(border = 8, size = 64): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: size - border * 2,
            height: size - border * 2,
            channels: 4,
            background: { r: 128, g: 128, b: 128, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        left: border,
        top: border,
      },
    ])
    .png()
    .toBuffer();
}

async function makeTransparentBorderImage(border = 8, size = 64): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: size - border * 2,
            height: size - border * 2,
            channels: 4,
            background: { r: 128, g: 128, b: 128, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        left: border,
        top: border,
      },
    ])
    .png()
    .toBuffer();
}

beforeAll(async () => {
  images["placeholder-gray"] = await makeImage(128, 128, 128);
  images["placeholder-gray-small"] = await makeImage(128, 128, 128, 32);
  images["placeholder-gray-white-border"] = await makeWhiteBorderImage();
  images["placeholder-gray-white-border-tight"] = await makeWhiteBorderImage(2, 12);
  images["placeholder-gray-transparent-border"] = await makeTransparentBorderImage();
  images["placeholder-blue"] = await makeImage(0, 0, 200);
  images["real-gradient"] = await makeGradient();
  images["real-noise"] = await makeNoise();

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const rawUrl = typeof input === "string" ? input : input.url;
    const parsed = new URL(rawUrl);

    if (parsed.port === "1") {
      throw new TypeError("fetch failed");
    }

    const name = parsed.pathname.slice(1);
    const image = images[name];
    if (!image) {
      return new Response(null, { status: 404, statusText: "Not Found" });
    }

    return new Response(image, {
      status: 200,
      headers: { "Content-Type": "image/png" },
    });
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

function url(name: string): string {
  return `https://img.test/${name}`;
}

describe("PlaceholderDetector", () => {
  it("detects an exact placeholder match", async () => {
    const detector = new PlaceholderDetector();
    await detector.addPlaceholder(url("placeholder-gray"), "gray");
    const result = await detector.isPlaceholder(url("placeholder-gray"));
    expect(result.isPlaceholder).toBe(true);
    expect(result.confidence).toBe(1);
    expect(result.matchedPlaceholder).toBe("gray");
    expect(result.distance).toBe(0);
  });

  it("detects a placeholder at a different resolution", async () => {
    const detector = new PlaceholderDetector();
    await detector.addPlaceholder(url("placeholder-gray"), "gray");
    const result = await detector.isPlaceholder(url("placeholder-gray-small"));
    expect(result.isPlaceholder).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.matchedPlaceholder).toBe("gray");
  });

  it("does not match a visually different image", async () => {
    const detector = new PlaceholderDetector();
    await detector.addPlaceholder(url("placeholder-gray"), "gray");
    const result = await detector.isPlaceholder(url("real-gradient"));
    expect(result.isPlaceholder).toBe(false);
    expect(result.matchedPlaceholder).toBeNull();
  });

  it("matches the closest placeholder when multiple are registered", async () => {
    const detector = new PlaceholderDetector();
    await detector.addPlaceholder(url("placeholder-gray"), "gray");
    await detector.addPlaceholder(url("placeholder-blue"), "blue");
    const result = await detector.isPlaceholder(url("placeholder-gray-small"));
    expect(result.isPlaceholder).toBe(true);
    expect(result.matchedPlaceholder).toBe("gray");
  });

  it("respects custom threshold", async () => {
    const detector = new PlaceholderDetector({ threshold: 0 });
    await detector.addPlaceholder(url("placeholder-gray"), "gray");
    const result = await detector.isPlaceholder(url("placeholder-gray"));
    expect(result.isPlaceholder).toBe(true);
    expect(result.distance).toBe(0);
  });

  it("trims whitespace by default when hashing detector inputs", async () => {
    const detector = new PlaceholderDetector({ threshold: 0 });
    await detector.addPlaceholder(url("placeholder-gray"), "gray");

    const result = await detector.isPlaceholder(url("placeholder-gray-white-border"));
    expect(result.isPlaceholder).toBe(true);
    expect(result.matchedPlaceholder).toBe("gray");
  });

  it("can disable whitespace trimming for legacy detector behavior", async () => {
    const detector = new PlaceholderDetector({
      threshold: 0,
      trimWhitespace: false,
    });
    await detector.addPlaceholder(url("placeholder-gray"), "gray");

    const result = await detector.isPlaceholder(url("placeholder-gray-white-border"));
    expect(result.isPlaceholder).toBe(false);
  });

  it("treats transparent borders as removable whitespace by default", async () => {
    const detector = new PlaceholderDetector({ threshold: 0 });
    await detector.addPlaceholder(url("placeholder-gray"), "gray");

    const result = await detector.isPlaceholder(
      url("placeholder-gray-transparent-border"),
    );
    expect(result.isPlaceholder).toBe(true);
  });

  it("uses a custom trim probe size when the default detector probe misses the border", async () => {
    const defaultDetector = new PlaceholderDetector({
      threshold: 0,
    });
    await defaultDetector.addPlaceholder(url("placeholder-gray"), "gray");

    const defaultResult = await defaultDetector.isPlaceholder(
      url("placeholder-gray-white-border-tight"),
    );
    expect(defaultResult.isPlaceholder).toBe(false);

    const detector = new PlaceholderDetector({
      threshold: 0,
      probeSize: { width: 32, height: 24 },
    });
    await detector.addPlaceholder(url("placeholder-gray"), "gray");

    const result = await detector.isPlaceholder(
      url("placeholder-gray-white-border-tight"),
    );
    expect(result.isPlaceholder).toBe(true);
    expect(result.matchedPlaceholder).toBe("gray");
  });

  it("validates probe size eagerly for detector callers", () => {
    expect(
      () => new PlaceholderDetector({ probeSize: { width: 8, height: 8 } }),
    ).toThrow(/probeSize/);
  });

  it("snapshots the validated probe size instead of reusing the caller object", async () => {
    const probeSize = { width: 32, height: 24 };
    const detector = new PlaceholderDetector({
      threshold: 0,
      probeSize,
    });

    probeSize.width = 8;
    probeSize.height = 8;

    await expect(
      detector.addPlaceholder(url("placeholder-gray"), "gray"),
    ).resolves.toBeUndefined();

    const result = await detector.isPlaceholder(
      url("placeholder-gray-white-border-tight"),
    );
    expect(result.isPlaceholder).toBe(true);
    expect(result.matchedPlaceholder).toBe("gray");
  });

  it("checkMany returns results for all URLs", async () => {
    const detector = new PlaceholderDetector();
    await detector.addPlaceholder(url("placeholder-gray"), "gray");
    const results = await detector.checkMany([
      url("placeholder-gray"),
      url("real-gradient"),
      url("real-noise"),
    ]);
    expect(results).toHaveLength(3);
    expect(results[0].isPlaceholder).toBe(true);
    expect(results[1].isPlaceholder).toBe(false);
    expect(results[2].isPlaceholder).toBe(false);
  });

  it("checkMany returns one result per URL even when some fetches fail", async () => {
    const detector = new PlaceholderDetector();
    await detector.addPlaceholder(url("placeholder-gray"), "gray");

    const results = await detector.checkMany([
      url("placeholder-gray"),
      url("missing-image"),
      url("real-gradient"),
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].isPlaceholder).toBe(true);

    expect(results[1].isPlaceholder).toBe(false);
    expect(results[1].confidence).toBe(0);
    expect(results[1].matchedPlaceholder).toBeNull();
    expect(results[1].distance).toBe(64);
    expect(results[1].error).toContain("Failed to fetch image: 404");

    expect(results[2].isPlaceholder).toBe(false);
    expect(results[2].error).toBeUndefined();
  });

  it("returns non-match when no placeholders are registered", async () => {
    const detector = new PlaceholderDetector();
    const result = await detector.isPlaceholder(url("real-gradient"));
    expect(result.isPlaceholder).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.matchedPlaceholder).toBeNull();
    expect(result.distance).toBe(64);
  });

  it("throws on addPlaceholder with unreachable URL", async () => {
    const detector = new PlaceholderDetector();
    await expect(
      detector.addPlaceholder("http://localhost:1/nonexistent", "bad"),
    ).rejects.toThrow();
  });

  it("throws when threshold is outside the supported range", () => {
    expect(() => new PlaceholderDetector({ threshold: -1 })).toThrow(/threshold/);
    expect(() => new PlaceholderDetector({ threshold: 65 })).toThrow(/threshold/);
    expect(() => new PlaceholderDetector({ threshold: 1.5 })).toThrow(/threshold/);
  });

  it("throws when concurrency is not a positive integer", () => {
    expect(() => new PlaceholderDetector({ concurrency: 0 })).toThrow(/concurrency/);
    expect(() => new PlaceholderDetector({ concurrency: -1 })).toThrow(/concurrency/);
    expect(() => new PlaceholderDetector({ concurrency: 2.5 })).toThrow(/concurrency/);
  });

  it("overwrites existing placeholder when adding with the same label", async () => {
    const detector = new PlaceholderDetector({ threshold: 0 });
    await detector.addPlaceholder(url("real-gradient"), "dup");
    await detector.addPlaceholder(url("real-noise"), "dup");

    // After overwrite, checking the noise image should match "dup" exactly
    const result = await detector.isPlaceholder(url("real-noise"));
    expect(result.isPlaceholder).toBe(true);
    expect(result.matchedPlaceholder).toBe("dup");
    expect(result.distance).toBe(0);

    // The old gradient entry should be gone, so gradient should NOT match at threshold 0
    const gradResult = await detector.isPlaceholder(url("real-gradient"));
    expect(gradResult.isPlaceholder).toBe(false);
  });

  it("uses the preset default threshold when hashSize is BIT_128", async () => {
    const detector = new PlaceholderDetector({ hashSize: HashSize.BIT_128 });
    await detector.addPlaceholder(url("placeholder-gray"), "gray");
    const result = await detector.isPlaceholder(url("placeholder-gray"));
    expect(result.isPlaceholder).toBe(true);
    expect(result.distance).toBe(0);
    expect(result.confidence).toBe(1);
  });

  it("validates explicit threshold against the active preset", () => {
    expect(() => new PlaceholderDetector({ hashSize: HashSize.BIT_64, threshold: 65 })).toThrow(/threshold/);
    expect(() => new PlaceholderDetector({ hashSize: HashSize.BIT_128, threshold: 129 })).toThrow(/threshold/);
    expect(() => new PlaceholderDetector({ hashSize: HashSize.BIT_256, threshold: 257 })).toThrow(/threshold/);
  });

  it("normalizes confidence using the active preset max distance", async () => {
    const detector = new PlaceholderDetector({ hashSize: HashSize.BIT_256, threshold: 256 });
    await detector.addPlaceholder(url("placeholder-gray"), "gray");
    const result = await detector.isPlaceholder(url("real-gradient"));
    // confidence should be based on 256-bit max distance
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("returns no-match with preset max distance when no placeholders are registered (BIT_128)", async () => {
    const detector = new PlaceholderDetector({ hashSize: HashSize.BIT_128 });
    const result = await detector.isPlaceholder(url("real-gradient"));
    expect(result.isPlaceholder).toBe(false);
    expect(result.distance).toBe(128);
    expect(result.confidence).toBe(0);
  });

  it("returns no-match with preset max distance when no placeholders are registered (BIT_256)", async () => {
    const detector = new PlaceholderDetector({ hashSize: HashSize.BIT_256 });
    const result = await detector.isPlaceholder(url("real-gradient"));
    expect(result.isPlaceholder).toBe(false);
    expect(result.distance).toBe(256);
    expect(result.confidence).toBe(0);
  });
});
