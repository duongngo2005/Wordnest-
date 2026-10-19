import { describe, expect, it } from "vitest";
import {
  createRandomLetterHint,
  getRandomLetterHintRevealCount,
  type RandomSource,
} from "./random-letter-hint";

function sequence(values: number[]): RandomSource {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

describe("createRandomLetterHint", () => {
  it("creates a partial masked word without exposing the full answer", () => {
    const hint = createRandomLetterHint("twice", sequence([0, 0, 0, 0, 0, 0]));

    expect(hint.maskedAnswer).toMatch(/_/);
    expect(hint.maskedAnswer).not.toBe("t w i c e");
    expect(hint.revealedCharacterIndexes).toHaveLength(2);
    expect(hint.revealedCharacterIndexes.every((index) => index >= 0 && index < 5)).toBe(true);
  });

  it("uses different randomized positions for different random sources", () => {
    const first = createRandomLetterHint(
      "accountability",
      sequence(Array.from({ length: 14 }, () => 0))
    );
    const second = createRandomLetterHint(
      "accountability",
      sequence(Array.from({ length: 14 }, () => 0.99))
    );

    expect(second.revealedCharacterIndexes).not.toEqual(first.revealedCharacterIndexes);
    expect(second.maskedAnswer).not.toBe(first.maskedAnswer);
  });

  it("keeps spaces, hyphens, and apostrophes visible", () => {
    const hint = createRandomLetterHint(
      "Don't re-check",
      sequence([0.5, 0.2, 0.8, 0.1, 0.7, 0.3, 0.9, 0.4, 0.6, 0.5, 0.2, 0.8, 0.1])
    );

    expect(hint.maskedAnswer).toContain("'");
    expect(hint.maskedAnswer).toContain("-");
    expect(hint.maskedAnswer).toContain("  ");
  });

  it("handles very short answers safely", () => {
    expect(createRandomLetterHint("a", () => 0.5)).toEqual({
      maskedAnswer: "_",
      revealedCharacterIndexes: [],
    });
    expect(createRandomLetterHint("Go", sequence([0.5, 0.5, 0.5]))).toEqual({
      maskedAnswer: "G _",
      revealedCharacterIndexes: [0],
    });
  });

  it("reveals roughly 30–60% while retaining at least two masks for longer answers", () => {
    for (const letterCount of [3, 4, 5, 8, 15]) {
      const revealed = getRandomLetterHintRevealCount(letterCount, () => 0.5);
      expect(revealed).toBeGreaterThanOrEqual(Math.ceil(letterCount * 0.3));
      expect(revealed).toBeLessThanOrEqual(Math.floor(letterCount * 0.6));
      expect(letterCount - revealed).toBeGreaterThanOrEqual(2);
    }
  });
});
