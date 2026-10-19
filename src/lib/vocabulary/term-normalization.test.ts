import { describe, expect, it } from "vitest";
import { normalizeVocabularyTerm } from "./term-normalization";

describe("normalizeVocabularyTerm", () => {
  it.each([
    [" accomplish ", "accomplish"],
    ["AcCoMpLiSh", "accomplish"],
    ["figure   out", "figure out"],
    ["cafe\u0301", "café"],
    ["follow-up", "follow-up"],
    ["follow up", "follow up"],
  ])("normalizes presentation-only variation in %j", (term, expected) => {
    expect(normalizeVocabularyTerm(term)).toBe(expected);
  });

  it.each([
    ["apply", "application"],
    ["accuse", "accused"],
    ["present", "presentation"],
    ["follow up", "follow-up"],
  ])("does not merge distinct lexical terms: %j and %j", (left, right) => {
    expect(normalizeVocabularyTerm(left)).not.toBe(normalizeVocabularyTerm(right));
  });
});
