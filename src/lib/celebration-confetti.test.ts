import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireSessionCompletionConfetti } from "./celebration-confetti";
import confetti from "canvas-confetti";

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

describe("celebration-confetti", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls confetti with earth-tone palette and reduced motion check", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    fireSessionCompletionConfetti();
    expect(confetti).toHaveBeenCalledTimes(1);
    expect(confetti).toHaveBeenCalledWith(
      expect.objectContaining({
        particleCount: 50,
        disableForReducedMotion: true,
      })
    );
  });

  it("does not fire when user prefers reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion: reduce"),
      })),
    });

    fireSessionCompletionConfetti();
    expect(confetti).not.toHaveBeenCalled();
  });
});
