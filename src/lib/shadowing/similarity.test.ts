import { describe, it, expect } from "vitest";
import {
  normalizeTranscript,
  normalizeToken,
  computeWordSimilarity,
} from "./similarity";

describe("similarity and normalization", () => {
  describe("normalizeTranscript", () => {
    it("handles lowercase, repeated whitespace, and punctuation", () => {
      const input = "  Hello,   world! How's it going?  ";
      expect(normalizeTranscript(input)).toBe("hello world how's it going");
    });

    it("normalizes curly quotes to straight quotes", () => {
      const input = "“We’ll meet at 9 p.m.”";
      expect(normalizeTranscript(input)).toBe("we'll meet at 9 p m");
    });

    it("returns empty string for empty input", () => {
      expect(normalizeTranscript("")).toBe("");
      expect(normalizeTranscript("   ")).toBe("");
    });
  });

  describe("normalizeToken", () => {
    it("strips trailing and leading punctuation but keeps internal apostrophe", () => {
      expect(normalizeToken('"Hello!"')).toBe("hello");
      expect(normalizeToken("don't,")).toBe("don't");
      expect(normalizeToken("‘world’")).toBe("world");
    });
  });

  describe("computeWordSimilarity", () => {
    it("returns 100% similarity and 0 WER for exact match", () => {
      const ref = "The meeting starts at nine.";
      const trans = "The meeting starts at nine.";
      const res = computeWordSimilarity(ref, trans);

      expect(res.similarity).toBe(100);
      expect(res.wer).toBe(0);
      expect(res.alignment.every((a) => a.status === "match")).toBe(true);
    });

    it("handles case differences and punctuation differences as matches", () => {
      const ref = "I look forward to meeting you.";
      const trans = "i look forward to meeting you";
      const res = computeWordSimilarity(ref, trans);

      expect(res.similarity).toBe(100);
      expect(res.wer).toBe(0);
      expect(res.alignment.every((a) => a.status === "match")).toBe(true);
    });

    it("detects missing words (omission) accurately", () => {
      const ref = "I look forward to meeting you.";
      const trans = "I look forward meeting you.";
      const res = computeWordSimilarity(ref, trans);

      // 1 omission out of 6 words -> similarity ~83%
      expect(res.similarity).toBe(83);
      expect(res.wer).toBeCloseTo(0.17, 2);

      const toWord = res.alignment.find((a) => a.reference === "to");
      expect(toWord).toBeDefined();
      expect(toWord?.status).toBe("omission");
    });

    it("detects substituted words accurately", () => {
      const ref = "The cat sat on the mat.";
      const trans = "The dog sat on the mat.";
      const res = computeWordSimilarity(ref, trans);

      // 1 substitution out of 6 words -> similarity ~83%
      expect(res.similarity).toBe(83);
      const sub = res.alignment.find((a) => a.reference === "cat");
      expect(sub?.status).toBe("substitution");
      expect(sub?.spoken).toBe("dog");
    });

    it("detects inserted extra words accurately", () => {
      const ref = "He likes coffee.";
      const trans = "He really likes hot coffee.";
      const res = computeWordSimilarity(ref, trans);

      const reallyWord = res.alignment.find((a) => a.spoken === "really");
      expect(reallyWord?.status).toBe("insertion");
      const hotWord = res.alignment.find((a) => a.spoken === "hot");
      expect(hotWord?.status).toBe("insertion");
      expect(res.wer).toBeGreaterThan(0);
    });

    it("handles empty transcript (0% similarity, 1.0 WER)", () => {
      const ref = "Good morning everyone.";
      const trans = "";
      const res = computeWordSimilarity(ref, trans);

      expect(res.similarity).toBe(0);
      expect(res.wer).toBe(1);
      expect(res.alignment.every((a) => a.status === "omission")).toBe(true);
    });

    it("handles empty reference", () => {
      const resEmpty = computeWordSimilarity("", "");
      expect(resEmpty.similarity).toBe(100);
      expect(resEmpty.wer).toBe(0);

      const resWithSpoken = computeWordSimilarity("", "Hello there");
      expect(resWithSpoken.similarity).toBe(0);
      expect(resWithSpoken.wer).toBe(1);
    });

    it("recognizes common contractions as matching", () => {
      const ref = "We don't know the answer.";
      const trans = "We do not know the answer.";
      const res = computeWordSimilarity(ref, trans);

      expect(res.similarity).toBe(100);
      expect(res.wer).toBe(0);
      expect(res.alignment.every((a) => a.status === "match")).toBe(true);
    });

    it("verifies can't/cannot, won't/will not, I'm/I am, you're/you are, and it's/it is", () => {
      expect(computeWordSimilarity("I can't swim.", "I cannot swim.").similarity).toBe(100);
      expect(computeWordSimilarity("They won't come.", "They will not come.").similarity).toBe(100);
      expect(computeWordSimilarity("I'm ready now.", "I am ready now.").similarity).toBe(100);
      expect(computeWordSimilarity("You're very kind.", "You are very kind.").similarity).toBe(100);
      expect(computeWordSimilarity("It's a sunny day.", "It is a sunny day.").similarity).toBe(100);
    });

    it("handles Unicode curly apostrophes in reference and transcript", () => {
      const ref = "It’s wonderful that you’re here.";
      const trans = "It's wonderful that you're here.";
      const res = computeWordSimilarity(ref, trans);

      expect(res.similarity).toBe(100);
      expect(res.wer).toBe(0);
    });

    it("handles hyphenated words and repeated words cleanly", () => {
      const ref = "This is a state-of-the-art model.";
      const trans = "This is a state of the art model.";
      const res = computeWordSimilarity(ref, trans);

      expect(res.similarity).toBe(100);

      // Repeated word detection
      const repeated = computeWordSimilarity("The car is fast.", "The the car is fast.");
      expect(repeated.wer).toBeGreaterThan(0);
      expect(repeated.alignment.some((a) => a.status === "insertion")).toBe(true);
    });

    it("handles multiple spaces and irregular formatting", () => {
      const ref = "  Hello    world!   ";
      const trans = "hello   world   ";
      const res = computeWordSimilarity(ref, trans);

      expect(res.similarity).toBe(100);
      expect(res.alignment.length).toBe(2);
    });
  });
});
