import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import sharp from "sharp";
import { PlaceholderDetector } from "./detector.js";

let server: Server;
let port: number;

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

beforeAll(async () => {
  images["placeholder-gray"] = await makeImage(128, 128, 128);
  images["placeholder-gray-small"] = await makeImage(128, 128, 128, 32);
  images["placeholder-blue"] = await makeImage(0, 0, 200);
  images["real-gradient"] = await makeGradient();
  images["real-noise"] = await makeNoise();

  server = createServer((req, res) => {
    const name = req.url?.slice(1); // strip leading /
    if (name && images[name]) {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(images[name]);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      port = typeof addr === "object" && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

function url(name: string): string {
  return `http://localhost:${port}/${name}`;
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
});
