import { describe, it, expect } from "vitest";
import { parseVocabularyInput, normalizeTerm } from "./parser";

describe("Vocabulary Parser", () => {
  it("parses simple semicolon separated words: apple;banana", () => {
    const result = parseVocabularyInput("apple;banana");
    expect(result.terms).toEqual(["apple", "banana"]);
    expect(result.uniqueCount).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("accepts new lines while preserving multi-word phrases", () => {
    expect(parseVocabularyInput("apple\ntake responsibility\ncloud computing").terms).toEqual([
      "apple",
      "take responsibility",
      "cloud computing",
    ]);
  });

  it("handles whitespace and trailing semicolon: 'apple ; banana ;'", () => {
    const result = parseVocabularyInput("apple ; banana ;");
    expect(result.terms).toEqual(["apple", "banana"]);
    expect(result.uniqueCount).toBe(2);
  });

  it("handles consecutive empty semicolons: 'apple;;banana'", () => {
    const result = parseVocabularyInput("apple;;banana");
    expect(result.terms).toEqual(["apple", "banana"]);
    expect(result.uniqueCount).toBe(2);
  });

  it("deduplicates case-insensitively while preserving first casing: 'Apple;apple;APPLE'", () => {
    const result = parseVocabularyInput("Apple;apple;APPLE");
    expect(result.terms).toEqual(["Apple"]);
    expect(result.uniqueCount).toBe(1);
    expect(result.duplicateCount).toBe(2);
  });

  it("preserves phrases: 'take responsibility; cloud computing'", () => {
    const result = parseVocabularyInput("take responsibility; cloud computing");
    expect(result.terms).toEqual(["take responsibility", "cloud computing"]);
    expect(result.uniqueCount).toBe(2);
  });

  it("matches example in specification: 'apple; resilient ; take responsibility;; Apple;'", () => {
    const result = parseVocabularyInput("apple; resilient ; take responsibility;; Apple;");
    expect(result.terms).toEqual(["apple", "resilient", "take responsibility"]);
    expect(result.uniqueCount).toBe(3);
    expect(result.duplicateCount).toBe(1);
  });

  it("handles empty or blank string gracefully", () => {
    expect(parseVocabularyInput("").terms).toEqual([]);
    expect(parseVocabularyInput("   ").terms).toEqual([]);
    expect(parseVocabularyInput(";;;   ;;").terms).toEqual([]);
  });

  it("enforces max limit of 30 terms and flags error", () => {
    const terms = Array.from({ length: 35 }, (_, i) => `word${i}`).join(";");
    const result = parseVocabularyInput(terms, 30);
    expect(result.terms.length).toBe(35);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("30");
  });

  it("normalizes terms correctly", () => {
    expect(normalizeTerm("  Take   Responsibility  ")).toBe("take responsibility");
    expect(normalizeTerm("APPLE")).toBe("apple");
  });

});
