import { describe, it, expect } from "vitest";
import {
  generateStoryRequestSchema,
  aiStoryResponseSchema,
  translateInContextRequestSchema,
  contextualTranslationResponseSchema,
  addCardFromStoryRequestSchema,
} from "./story";

describe("Phase 2 Story & Translation Validation Schemas", () => {
  it("validates story generation request", () => {
    const valid = {
      deckId: "deck-123",
      targetWords: ["apple", "resilient"],
      cefr: "B1",
      length: "medium",
      topic: "Daily Life",
    };
    expect(generateStoryRequestSchema.safeParse(valid).success).toBe(true);

    // Rejects empty targetWords
    expect(
      generateStoryRequestSchema.safeParse({ ...valid, targetWords: [] }).success
    ).toBe(false);

    // Custom topics are supported, while too-short topics are still rejected.
    expect(generateStoryRequestSchema.safeParse({ ...valid, topic: "Cooking" }).success).toBe(true);
    expect(generateStoryRequestSchema.safeParse({ ...valid, topic: "X" }).success).toBe(false);
  });

  it("validates AI story response schema", () => {
    const story = {
      title: "The Garden of Resilience",
      content: "Once upon a time in a small village...\n\nMaya learned to take responsibility.",
      wordsUsed: ["resilience", "take responsibility"],
    };
    expect(aiStoryResponseSchema.safeParse(story).success).toBe(true);
  });

  it("accepts a Story response when optional contextual translations are absent", () => {
    expect(
      aiStoryResponseSchema.safeParse({
        title: "The Plan",
        content: "The team allocated funds carefully.",
        usage: [{ term: "allocate", usedAs: "allocated" }],
      }).success
    ).toBe(true);
  });

  it("validates translate in context request", () => {
    const req = {
      storyId: "story-123",
      deckId: "deck-123",
      selectedText: "reluctant",
      surroundingSentence: "He was reluctant to admit his mistake.",
      context: "Story Chapter 1",
    };
    expect(translateInContextRequestSchema.safeParse(req).success).toBe(true);

    // Rejects empty selectedText
    expect(
      translateInContextRequestSchema.safeParse({ ...req, selectedText: "" }).success
    ).toBe(false);
  });

  it("validates contextual translation response", () => {
    const trans = {
      selectedText: "reluctant",
      meaningVi: "miễn cưỡng, lưỡng lự",
      contextualMeaningVi: "Trong câu này: do dự không muốn thừa nhận",
      ipa: "/rɪˈlʌk.tənt/",
      partOfSpeech: "adjective",
      definitionEn: "unwilling and hesitant",
      exampleEn: "He was reluctant to admit his mistake.",
      exampleVi: "Anh ấy miễn cưỡng thừa nhận sai lầm của mình.",
      cefr: "B2",
    };
    expect(contextualTranslationResponseSchema.safeParse(trans).success).toBe(true);
  });

  it("validates add card from story schema", () => {
    const cardData = {
      deckId: "deck-123",
      term: "reluctant",
      meaningVi: "miễn cưỡng",
      definitionEn: "hesitant and unwilling",
      exampleEn: "He was reluctant to leave.",
      exampleVi: "Anh ấy miễn cưỡng rời đi.",
    };
    expect(addCardFromStoryRequestSchema.safeParse(cardData).success).toBe(true);
  });
});
