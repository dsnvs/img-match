import { describe, expect, it, vi } from "vitest";
import { PlaceholderDetector } from "./detector.js";

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
});
