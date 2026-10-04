import { describe, it, expect } from "vitest";
import { analyzeVocabularyCoverage } from "@/lib/story/story-vocabulary";

describe("analyzeVocabularyCoverage edge cases for Lessons", () => {
  it("matches verb inflections (apply -> applied, recruit -> recruited)", () => {
    const content = "The company recruited three new engineers. She applied for the senior role yesterday.";
    const result = analyzeVocabularyCoverage(content, [
      { term: "apply", partOfSpeech: "verb" },
      { term: "recruit", partOfSpeech: "verb" },
    ]);

    expect(result.missing).toEqual([]);
    expect(result.used.map((u) => u.usedAs)).toEqual(["applied", "recruited"]);
  });

  it("matches noun plural inflections (candidate -> candidates)", () => {
    const content = "Many qualified candidates attended the interview.";
    const result = analyzeVocabularyCoverage(content, [
      { term: "candidate", partOfSpeech: "noun" },
    ]);

    expect(result.missing).toEqual([]);
    expect(result.used[0]?.usedAs).toBe("candidates");
  });

  it("handles phrasal verbs with inflected head (call in -> called in)", () => {
    const content = "The manager called in a specialist to review the security architecture.";
    const result = analyzeVocabularyCoverage(content, [
      { term: "call in", partOfSpeech: "verb" },
    ]);

    expect(result.missing).toEqual([]);
    expect(result.used[0]?.usedAs).toBe("called in");
  });

  it("handles multi-word expressions without inflections preserving text casing", () => {
    const content = "In spite of the heavy rain, the team delivered the project on time.";
    const result = analyzeVocabularyCoverage(content, [
      "in spite of",
    ]);

    expect(result.missing).toEqual([]);
    expect(result.used[0]?.usedAs).toBe("In spite of");
  });

  it("does not match word when only in title", () => {
    const content = "This passage talks about office etiquette.";
    const result = analyzeVocabularyCoverage(content, ["negotiation"]);

    expect(result.missing).toEqual(["negotiation"]);
    expect(result.used).toEqual([]);
  });

  it("does not match partial word in another word (e.g. 'car' in 'careful')", () => {
    const content = "Be careful when crossing the street.";
    const result = analyzeVocabularyCoverage(content, ["car"]);

    expect(result.missing).toEqual(["car"]);
  });

  it("detects when word is missing even after inflections checked", () => {
    const content = "The team worked hard all day.";
    const result = analyzeVocabularyCoverage(content, ["negotiate", "compromise"]);

    expect(result.missing).toEqual(["negotiate", "compromise"]);
  });
});
