import { describe, expect, it, vi } from "vitest";
import { PlaceholderDetector } from "./detector.js";
import { HashSize } from "./hash-size.js";

describe("PlaceholderDetector empty state", () => {
  it("returns a non-match without fetching when no placeholders are registered", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch should not be called"));

    const detector = new PlaceholderDetector();

    await expect(
      detector.isPlaceholder("https://cdn.example.com/items/widget.png"),
    ).resolves.toEqual({
      isPlaceholder: false,
      confidence: 0,
      matchedPlaceholder: null,
      distance: 64,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns one non-match per URL without fetching in checkMany", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch should not be called"));

    const detector = new PlaceholderDetector();

    await expect(
      detector.checkMany([
        "https://cdn.example.com/items/widget.png",
        "https://cdn.example.com/items/gadget.png",
      ]),
    ).resolves.toEqual([
      {
        isPlaceholder: false,
        confidence: 0,
        matchedPlaceholder: null,
        distance: 64,
      },
      {
        isPlaceholder: false,
        confidence: 0,
        matchedPlaceholder: null,
        distance: 64,
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses preset max distance for empty state with BIT_128", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch should not be called"));

    const detector = new PlaceholderDetector({ hashSize: HashSize.BIT_128 });

    await expect(
      detector.isPlaceholder("https://cdn.example.com/items/widget.png"),
    ).resolves.toEqual({
      isPlaceholder: false,
      confidence: 0,
      matchedPlaceholder: null,
      distance: 128,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses preset max distance for empty state with BIT_256", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch should not be called"));

    const detector = new PlaceholderDetector({ hashSize: HashSize.BIT_256 });

    await expect(
      detector.checkMany([
        "https://cdn.example.com/items/widget.png",
      ]),
    ).resolves.toEqual([
      {
        isPlaceholder: false,
        confidence: 0,
        matchedPlaceholder: null,
        distance: 256,
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws RangeError for unsupported hashSize values", () => {
    expect(
      () => new PlaceholderDetector({ hashSize: "BIT_1024" as HashSize }),
    ).toThrow(RangeError);
    expect(
      () => new PlaceholderDetector({ hashSize: "BIT_1024" as HashSize }),
    ).toThrow(/hashSize/);
  });
});
