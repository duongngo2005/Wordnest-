import { describe, it, expect } from "vitest";
import {
  generatedFlashcardItemSchema,
  manualFlashcardItemSchema,
  updateFlashcardRequestSchema,
} from "./flashcard";

describe("Flashcard Zod Validation", () => {
  it("validates a complete flashcard item correctly", () => {
    const validCard = {
      requestedTerm: "resilient",
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

  it("requires a controlled POS for AI output while keeping optional metadata defaulted", () => {
    const minimalCard = {
      requestedTerm: "apple",
      term: "apple",
      meaningVi: "quả táo",
      definitionEn: "a round fruit with red or green skin and firm white flesh",
      partOfSpeech: "noun",
      exampleEn: "He ate a fresh apple.",
      exampleVi: "Anh ấy đã ăn một quả táo tươi.",
      imageUseful: true,
      imageSearchQuery: "red apple fruit",
    };

    const parsed = generatedFlashcardItemSchema.safeParse(minimalCard);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ipa).toBeNull();
      expect(parsed.data.partOfSpeech).toBe("noun");
      expect(parsed.data.cefr).toBeNull();
      expect(parsed.data.imageUseful).toBe(true);
      expect(parsed.data.imageSearchQuery).toBe("red apple fruit");
    }
  });

  it("rejects invalid CEFR level", () => {
    const invalidCard = {
      requestedTerm: "apple",
      term: "apple",
      meaningVi: "quả táo",
      definitionEn: "a fruit",
      exampleEn: "An apple a day.",
      exampleVi: "Một quả táo mỗi ngày.",
      partOfSpeech: "noun",
      cefr: "Z9", // Invalid!
      imageUseful: false,
    };

    const parsed = generatedFlashcardItemSchema.safeParse(invalidCard);
    expect(parsed.success).toBe(false);
  });

  it("keeps legacy/image drafts parseable but rejects malformed controlled POS", () => {
    const base = {
      requestedTerm: "address",
      term: "address",
      meaningVi: "đề cập và xử lý vấn đề",
      definitionEn: "to deal with a problem",
      exampleEn: "We need to address this problem.",
      exampleVi: "Chúng ta cần xử lý vấn đề này.",
    };

    expect(generatedFlashcardItemSchema.safeParse(base).success).toBe(true);
    expect(generatedFlashcardItemSchema.safeParse({ ...base, partOfSpeech: "noun/verb" }).success).toBe(false);
  });

  it("accepts a manual flashcard with only a word and Vietnamese meaning", () => {
    const result = manualFlashcardItemSchema.safeParse({
      term: "troubleshoot",
      meaningVi: "xử lý sự cố",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.definitionEn).toBeUndefined();
      expect(result.data.exampleEn).toBeUndefined();
    }
  });

  it("treats blank optional manual fields as omitted", () => {
    const result = manualFlashcardItemSchema.safeParse({
      term: "troubleshoot",
      meaningVi: "xử lý sự cố",
      partOfSpeech: "",
      ipa: "",
      definitionEn: "",
      exampleEn: "",
      exampleVi: "",
      cefr: "",
      imageUrl: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cefr).toBeUndefined();
    }
  });

  it("accepts optional manual flashcard details", () => {
    const result = manualFlashcardItemSchema.safeParse({
      term: "reliable",
      meaningVi: "đáng tin cậy",
      ipa: "/rɪˈlaɪ.ə.bəl/",
      partOfSpeech: "adjective",
      cefr: "B1",
      definitionEn: "able to be trusted",
      exampleEn: "This is a reliable system.",
      exampleVi: "Đây là một hệ thống đáng tin cậy.",
      imageUrl: "https://example.com/reliable.png",
    });

    expect(result.success).toBe(true);
  });

  it("requires both word and Vietnamese meaning for manual flashcards", () => {
    expect(manualFlashcardItemSchema.safeParse({ meaningVi: "nghĩa" }).success).toBe(false);
    expect(manualFlashcardItemSchema.safeParse({ term: "word" }).success).toBe(false);
  });

  it("keeps lexical update input separate from scheduler state", () => {
    expect(updateFlashcardRequestSchema.safeParse({ term: "allocate", meaningVi: "phân bổ", cefr: "B2" }).success).toBe(true);
    expect(updateFlashcardRequestSchema.safeParse({ cefr: "B3" }).success).toBe(true);
    expect(updateFlashcardRequestSchema.safeParse({ due: new Date().toISOString() }).success).toBe(false);
  });

  it("uses the controlled POS list for newly authored cards", () => {
    expect(manualFlashcardItemSchema.safeParse({ term: "allocate", meaningVi: "phân bổ", partOfSpeech: "verb" }).success).toBe(true);
    expect(manualFlashcardItemSchema.safeParse({ term: "allocate", meaningVi: "phân bổ", partOfSpeech: "made up POS" }).success).toBe(false);
  });

  describe("visualScore and AUTO_IMAGE_MIN_SCORE pipeline", () => {
    it("activates imageUseful when visualScore >= AUTO_IMAGE_MIN_SCORE (75)", () => {
      const card = {
        requestedTerm: "parachute",
        term: "parachute",
        meaningVi: "cái dù nhảy",
        definitionEn: "a cloth canopy that fills with air to slow the fall of a person or object",
        exampleEn: "He pulled the cord to open his parachute.",
        exampleVi: "Anh ấy đã giật dây để mở dù.",
        partOfSpeech: "noun",
        visualScore: 92,
        imageSearchQuery: "skydiver open parachute sky",
      };

      const parsed = generatedFlashcardItemSchema.safeParse(card);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.visualScore).toBe(92);
        expect(parsed.data.imageUseful).toBe(true);
        expect(parsed.data.imageSearchQuery).toBe("skydiver open parachute sky");
      }
    });

    it("suppresses imageSearchQuery and marks imageUseful as false when visualScore < 75", () => {
      const card = {
        requestedTerm: "perspective",
        term: "perspective",
        meaningVi: "góc nhìn, quan điểm",
        definitionEn: "a particular attitude towards or way of regarding something",
        exampleEn: "Try to see the problem from my perspective.",
        exampleVi: "Hãy thử nhìn nhận vấn đề từ góc nhìn của tôi.",
        partOfSpeech: "noun",
        visualScore: 35,
        imageSearchQuery: "person thinking concept",
      };

      const parsed = generatedFlashcardItemSchema.safeParse(card);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.visualScore).toBe(35);
        expect(parsed.data.imageUseful).toBe(false);
        expect(parsed.data.imageSearchQuery).toBeNull();
      }
    });

    it("resolves legacy imageUseful boolean correctly", () => {
      const legacyTrueCard = {
        requestedTerm: "microscope",
        term: "microscope",
        meaningVi: "kính hiển vi",
        definitionEn: "an optical instrument",
        exampleEn: "He looked through the microscope.",
        exampleVi: "Anh ấy nhìn qua kính hiển vi.",
        partOfSpeech: "noun",
        imageUseful: true,
        imageSearchQuery: "laboratory microscope instrument",
      };

      const parsed = generatedFlashcardItemSchema.safeParse(legacyTrueCard);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.visualScore).toBe(85);
        expect(parsed.data.imageUseful).toBe(true);
        expect(parsed.data.imageSearchQuery).toBe("laboratory microscope instrument");
      }
    });
  });
});
