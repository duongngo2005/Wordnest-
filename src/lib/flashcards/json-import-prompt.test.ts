import { describe, expect, it } from "vitest";
import { getJsonFlashcardImportPrompt } from "./json-import-prompt";

const prompt = getJsonFlashcardImportPrompt({
  collectionName: "10 Days Vocabulary",
  deckName: "Day 1",
});

describe("getJsonFlashcardImportPrompt", () => {
  it("injects the current collection name", () => {
    expect(prompt).toContain("Collection: 10 Days Vocabulary");
  });

  it("injects the current deck name", () => {
    expect(prompt).toContain("Deck: Day 1");
  });

  it("requires the V1 JSON contract", () => {
    expect(prompt).toContain('"schemaVersion": 1');
  });

  it("states the one-card, one-sense, one-part-of-speech rule", () => {
    expect(prompt).toContain("1 flashcard = 1 sense = 1 part of speech");
  });

  it("forbids mixing parts of speech in one card", () => {
    expect(prompt).toContain("Không gộp noun với verb");
  });

  it("includes consistent noun and verb access examples", () => {
    expect(prompt).toContain('"partOfSpeech": "verb"');
    expect(prompt).toContain("You can access the building through the main entrance.");
    expect(prompt).toContain('"partOfSpeech": "noun"');
    expect(prompt).toContain("Only members have access to this area.");
  });

  it("requires domain-neutral examples without explicit user context", () => {
    expect(prompt).toContain("KHÔNG mặc định IT, business, TOEIC, academic hoặc workplace");
    expect(prompt).toContain("The theater has a seating capacity of 800 people.");
  });

  it("treats collection and deck names as metadata, not domain context", () => {
    expect(prompt).toContain("Tên Collection và Deck chỉ là metadata tham khảo");
    expect(prompt).toContain("không được dùng chúng để suy đoán domain");
  });

  it("gives user-provided context the highest priority", () => {
    expect(prompt).toContain("User-provided context có priority cao nhất");
    expect(prompt).toContain("We sat on the bank beside the river.");
  });

  it("forbids WordNest internal fields", () => {
    expect(prompt).toContain("deckId");
    expect(prompt).toContain("learningStatus");
    expect(prompt).toContain("imageSearchQuery");
  });

  it("makes images optional", () => {
    expect(prompt).toContain("imageUrl vẫn là optional");
  });

  it("requires null when an image URL cannot be verified", () => {
    expect(prompt).toContain("Nếu không thể xác minh, imageUrl = null");
  });

  it("does not instruct the chatbot to use WordNest AI", () => {
    expect(prompt).not.toMatch(/gọi (?:WordNest )?AI/i);
    expect(prompt).not.toMatch(/WordNest AI/i);
  });
});
