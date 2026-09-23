import { describe, expect, it } from "vitest";
import { parseJsonFlashcardImport } from "./json-import";

const fullPayload = JSON.stringify({
  schemaVersion: 1,
  cards: [{
    term: "apple",
    meaningVi: "quả táo",
    partOfSpeech: "noun",
    ipa: "/ˈæpəl/",
    definitionEn: "a round fruit",
    exampleEn: "She ate an apple.",
    exampleVi: "Cô ấy ăn một quả táo.",
    cefr: "A1",
    imageUrl: "https://images.example.com/apple.jpg",
  }],
});

describe("parseJsonFlashcardImport", () => {
  it("accepts a complete valid JSON payload", () => {
    const result = parseJsonFlashcardImport(fullPayload);

    expect(result).toMatchObject({ valid: true });
    if (result.valid) expect(result.payload.cards[0]).toMatchObject({ term: "apple", cefr: "A1" });
  });

  it("accepts a minimal card and nullable optional fields", () => {
    const result = parseJsonFlashcardImport(JSON.stringify({
      schemaVersion: 1,
      cards: [{ term: "perspective", meaningVi: "quan điểm; góc nhìn", cefr: null, imageUrl: null }],
    }));

    expect(result).toMatchObject({ valid: true });
  });

  it("accepts multiple cards and strips one outer markdown fence", () => {
    const result = parseJsonFlashcardImport(`\`\`\`json\n${JSON.stringify({
      schemaVersion: 1,
      cards: [
        { term: "apple", meaningVi: "quả táo" },
        { term: "banana", meaningVi: "quả chuối" },
      ],
    })}\n\`\`\``);

    expect(result).toMatchObject({ valid: true });
    if (result.valid) expect(result.payload.cards).toHaveLength(2);
  });

  it.each([
    ["invalid JSON", "{", "JSON không hợp lệ"],
    ["unsupported version", JSON.stringify({ schemaVersion: 2, cards: [] }), "schemaVersion"],
    ["missing term", JSON.stringify({ schemaVersion: 1, cards: [{ meaningVi: "quả táo" }] }), "cards[0].term"],
    ["missing meaning", JSON.stringify({ schemaVersion: 1, cards: [{ term: "apple" }] }), "cards[0].meaningVi"],
    ["invalid CEFR", JSON.stringify({ schemaVersion: 1, cards: [{ term: "apple", meaningVi: "quả táo", cefr: "B3" }] }), "cards[0].cefr"],
    ["invalid image URL", JSON.stringify({ schemaVersion: 1, cards: [{ term: "apple", meaningVi: "quả táo", imageUrl: "http://localhost/a.png" }] }), "cards[0].imageUrl"],
    ["prohibited field", JSON.stringify({ schemaVersion: 1, cards: [{ term: "apple", meaningVi: "quả táo", deckId: "forbidden" }] }), "cards[0]"],
  ])("rejects %s", (_label, rawJson, expectedError) => {
    const result = parseJsonFlashcardImport(rawJson);

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(" ")).toContain(expectedError);
  });
});
