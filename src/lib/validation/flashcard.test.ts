import { describe, it, expect } from "vitest";
import {
  aiBatchFlashcardResponseSchema,
  generatedFlashcardItemSchema,
  generateDeckRequestSchema,
} from "./flashcard";

describe("Flashcard Zod Validation", () => {
  it("validates a complete flashcard item correctly", () => {
    const validCard = {
      term: "resilient",
      meaningVi: "kiên cường, có khả năng phục hồi nhanh",
      definitionEn: "able to withstand or recover quickly from difficult conditions",
      ipa: "/rɪˈzɪl.jənt/",
      partOfSpeech: "adjective",
      cefr: "B2",
      exampleEn: "She is a resilient woman who overcomes every obstacle.",
      exampleVi: "Cô ấy là một người phụ nữ kiên cường vượt qua mọi trở ngại.",
      imageUseful: false,
      imageSearchQuery: null,
    };

    const parsed = generatedFlashcardItemSchema.safeParse(validCard);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.term).toBe("resilient");
      expect(parsed.data.cefr).toBe("B2");
      expect(parsed.data.imageUseful).toBe(false);
    }
  });

  it("handles null and omitted optional fields with defaults", () => {
    const minimalCard = {
      term: "apple",
      meaningVi: "quả táo",
      definitionEn: "a round fruit with red or green skin and firm white flesh",
      exampleEn: "He ate a fresh apple.",
      exampleVi: "Anh ấy đã ăn một quả táo tươi.",
      imageUseful: true,
      imageSearchQuery: "red apple fruit",
    };

    const parsed = generatedFlashcardItemSchema.safeParse(minimalCard);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ipa).toBeNull();
      expect(parsed.data.partOfSpeech).toBeNull();
      expect(parsed.data.cefr).toBeNull();
      expect(parsed.data.imageUseful).toBe(true);
      expect(parsed.data.imageSearchQuery).toBe("red apple fruit");
    }
  });

  it("rejects invalid CEFR level", () => {
    const invalidCard = {
      term: "apple",
      meaningVi: "quả táo",
      definitionEn: "a fruit",
      exampleEn: "An apple a day.",
      exampleVi: "Một quả táo mỗi ngày.",
      cefr: "Z9", // Invalid!
      imageUseful: false,
    };

    const parsed = generatedFlashcardItemSchema.safeParse(invalidCard);
    expect(parsed.success).toBe(false);
  });

  it("validates batch response wrapper", () => {
    const batchData = {
      flashcards: [
        {
          term: "take responsibility",
          meaningVi: "chịu trách nhiệm",
          definitionEn: "to accept blame or duty for something",
          ipa: "/teɪk rɪˌspɒn.sɪˈbɪl.ə.ti/",
          partOfSpeech: "phrase",
          cefr: "B1",
          exampleEn: "Good leaders always take responsibility for team mistakes.",
          exampleVi: "Những nhà lãnh đạo giỏi luôn chịu trách nhiệm về sai lầm của đội ngũ.",
          imageUseful: false,
          imageSearchQuery: null,
        },
      ],
    };

    const parsed = aiBatchFlashcardResponseSchema.safeParse(batchData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.flashcards.length).toBe(1);
    }
  });

  it("validates deck generation request input", () => {
    expect(generateDeckRequestSchema.safeParse({ rawInput: "" }).success).toBe(false);
    expect(
      generateDeckRequestSchema.safeParse({
        deckName: "Tech Vocabulary",
        rawInput: "cloud computing; kubernetes",
      }).success
    ).toBe(true);
  });
});
