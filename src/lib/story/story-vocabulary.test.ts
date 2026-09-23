import { describe, expect, it } from "vitest";
import {
  createStoryVocabularyMetadata,
  normalizeStoryVocabulary,
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
    });
  });

  it("creates v3 metadata from WordNest-selected terms, not chatbot-provided terms", () => {
    expect(
      createStoryVocabularyMetadata(
        ["allocate", "reliable"],
        [{ term: "allocate", usedAs: "allocated" }]
      )
    ).toEqual({
      schemaVersion: 3,
      requestedTerms: ["allocate", "reliable"],
      usage: [{ term: "allocate", usedAs: "allocated" }],
      contextualTranslations: [],
      selectionTranslations: [],
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
});
