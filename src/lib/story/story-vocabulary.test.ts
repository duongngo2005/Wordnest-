import { describe, expect, it } from "vitest";
import {
  createStoryVocabularyMetadata,
  normalizeStoryVocabulary,
  analyzeVocabularyCoverage,
} from "./story-vocabulary";

describe("Story vocabulary metadata", () => {
  it("normalizes legacy string arrays into canonical usage", () => {
    expect(normalizeStoryVocabulary(["allocate", "reliable"])).toEqual({
      requestedTerms: ["allocate", "reliable"],
      usage: [
        { term: "allocate", usedAs: "allocate" },
        { term: "reliable", usedAs: "reliable" },
      ],
      contextualTranslations: [],
      selectionTranslations: [],
      narration: { voiceIds: [] },
    });
  });

  it("normalizes v2 metadata without losing canonical terms or used forms", () => {
    expect(
      normalizeStoryVocabulary({
        schemaVersion: 2,
        requestedTerms: ["allocate", "reliable"],
        usage: [
          { term: "allocate", usedAs: "allocated" },
          { term: "reliable", usedAs: "reliable" },
        ],
      })
    ).toEqual({
      requestedTerms: ["allocate", "reliable"],
      usage: [
        { term: "allocate", usedAs: "allocated" },
        { term: "reliable", usedAs: "reliable" },
      ],
      contextualTranslations: [],
      selectionTranslations: [],
      narration: { voiceIds: [] },
    });
  });

  it("creates v4 metadata from WordNest-selected terms, not chatbot-provided terms", () => {
    expect(
      createStoryVocabularyMetadata(
        ["allocate", "reliable"],
        [{ term: "allocate", usedAs: "allocated" }]
      )
    ).toEqual({
      schemaVersion: 4,
      requestedTerms: ["allocate", "reliable"],
      usage: [{ term: "allocate", usedAs: "allocated" }],
      contextualTranslations: [],
      selectionTranslations: [],
      narration: { voiceIds: [] },
    });
  });

  it("normalizes v3 target and lazy contextual caches", () => {
    const translation = {
      selectedText: "bank",
      meaningVi: "ngân hàng",
      contextualMeaningVi: "ngân hàng",
      definitionVi: null,
      ipa: null,
      partOfSpeech: "noun",
      definitionEn: "a financial institution",
      exampleEn: "The bank approved the loan.",
      exampleVi: "Ngân hàng đã duyệt khoản vay.",
      cefr: "A2",
    };

    expect(
      normalizeStoryVocabulary({
        schemaVersion: 3,
        requestedTerms: ["allocate"],
        usage: [{ term: "allocate", usedAs: "allocated" }],
        contextualTranslations: [
          { term: "allocate", usedAs: "allocated", meaningVi: "phân bổ" },
        ],
        selectionTranslations: [
          {
            selectedText: "bank",
            canonicalTerm: null,
            surroundingSentence: "The bank approved the loan.",
            translation,
          },
        ],
      })
    ).toMatchObject({
      contextualTranslations: [
        { term: "allocate", usedAs: "allocated", meaningVi: "phân bổ" },
      ],
      selectionTranslations: [{ selectedText: "bank", translation }],
    });
  });

  it("keeps every prepared cloud narration voice in v4 metadata", () => {
    expect(
      normalizeStoryVocabulary({
        schemaVersion: 4,
        requestedTerms: ["apply"],
        usage: [{ term: "apply", usedAs: "applied" }],
        contextualTranslations: [],
        selectionTranslations: [],
        narration: { voiceIds: ["wordnest:ava", "wordnest:ryan"] },
      })
    ).toMatchObject({ narration: { voiceIds: ["wordnest:ava", "wordnest:ryan"] } });
  });
});

describe("analyzeVocabularyCoverage with span collision resolution", () => {
  it("allocates single occurrence to exact match over derived match (recruit vs recruiting)", () => {
    const content = "She was recruiting new staff for the project.";
    const result = analyzeVocabularyCoverage(content, ["recruit", "recruiting"]);

    expect(result.totalTerms).toBe(2);
    expect(result.matchedTerms).toBe(1);
    expect(result.used).toEqual([
      { term: "recruiting", usedAs: "recruiting", start: 8, end: 18 },
    ]);
    expect(result.missing).toEqual(["recruit"]);
    expect(result.collisions.length).toBeGreaterThan(0);
    expect(result.collisions[0].winnerTerm).toBe("recruiting");
    expect(result.collisions[0].competingTerms).toContain("recruit");
  });

  it("matches both terms when distinct occurrences exist (recruit and recruiting)", () => {
    const content = "She was recruiting new staff because the firm wanted to recruit top talent.";
    const result = analyzeVocabularyCoverage(content, ["recruit", "recruiting"]);

    expect(result.totalTerms).toBe(2);
    expect(result.matchedTerms).toBe(2);
    const termsMatched = result.used.map((u) => u.term);
    expect(termsMatched).toContain("recruit");
    expect(termsMatched).toContain("recruiting");
  });

  it("handles benefit vs benefits exact vs derived competition", () => {
    // Single occurrence: exact "benefits" wins
    const content1 = "The package includes multiple benefits.";
    const result1 = analyzeVocabularyCoverage(content1, ["benefit", "benefits"]);
    expect(result1.matchedTerms).toBe(1);
    expect(result1.used[0].term).toBe("benefits");
    expect(result1.missing).toEqual(["benefit"]);

    // Dual occurrences: both win separate spans
    const content2 = "One major benefit is health insurance, and there are other benefits too.";
    const result2 = analyzeVocabularyCoverage(content2, ["benefit", "benefits"]);
    expect(result2.matchedTerms).toBe(2);
    expect(result2.missing).toEqual([]);
  });

  it("handles apply vs applying exact vs derived competition", () => {
    // Single occurrence: exact "applying" wins
    const content1 = "He is applying for the role today.";
    const result1 = analyzeVocabularyCoverage(content1, ["apply", "applying"]);
    expect(result1.matchedTerms).toBe(1);
    expect(result1.used[0].term).toBe("applying");
    expect(result1.missing).toEqual(["apply"]);

    // Dual occurrences: both win separate spans
    const content2 = "You can apply now; many people are already applying.";
    const result2 = analyzeVocabularyCoverage(content2, ["apply", "applying"]);
    expect(result2.matchedTerms).toBe(2);
    expect(result2.missing).toEqual([]);
  });

  it("prioritizes multi-word phrasal verbs over single-word sub-tokens", () => {
    const content = "Please call in to discuss the schedule.";
    const result = analyzeVocabularyCoverage(content, ["call in", "call"]);
    // "call in" claims the span [7, 14]
    expect(result.used).toContainEqual(
      expect.objectContaining({ term: "call in", usedAs: "call in" })
    );
    // "call" cannot claim "call in" because "call in" won the overlapping span
    expect(result.missing).toEqual(["call"]);
  });
});

