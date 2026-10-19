import { describe, expect, it } from "vitest";
import { externalAiV3ImportReviewSchema, parseExternalAiV3Import, parseJsonFlashcardImport } from "./json-import";

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

const externalTerms = Array.from({ length: 50 }, (_, index) => `external-term-${index + 1}`);
const externalManifest = { terms: externalTerms };

function externalCard(term: string) {
  return {
    term,
    meaningVi: `nghĩa của ${term}`,
    partOfSpeech: "noun",
    ipa: null,
    definitionEn: `a clear meaning for ${term}`,
    exampleEn: `This is an example using ${term}.`,
    exampleVi: `Đây là ví dụ dùng ${term}.`,
    cefr: null,
    imageUrl: null,
  };
}

function externalPayload(cards: unknown = externalTerms.map(externalCard)) {
  return JSON.stringify({ schemaVersion: 1, cards });
}

describe("parseExternalAiV3Import", () => {
  it("accepts a complete 50-term V3 response with nullable IPA and imageUrl", () => {
    const result = parseExternalAiV3Import(externalPayload(), externalManifest);

    expect(result).toMatchObject({ valid: true, comparison: { isExactMatch: true, expectedCount: 50, receivedCount: 50 } });
    if (result.valid) expect(result.payload.cards).toHaveLength(50);
  });

  it.each([
    ["a missing requested term", externalPayload(externalTerms.slice(1).map(externalCard)), "Missing term: \"external-term-1\"."],
    ["an extra term", externalPayload([...externalTerms.map(externalCard), externalCard("unexpected-term")]), "Unexpected term: \"unexpected-term\"."],
    ["a duplicate term", externalPayload([...externalTerms.slice(0, -1).map(externalCard), externalCard("external-term-1")]), "Duplicate term in imported JSON: \"external-term-1\"."],
    ["a spelling change", externalPayload([externalCard("external-term-01"), ...externalTerms.slice(1).map(externalCard)]), "Term spelling changed: expected \"external-term-1\", received \"external-term-01\"."],
    ["wrong order", externalPayload([externalCard(externalTerms[1]), externalCard(externalTerms[0]), ...externalTerms.slice(2).map(externalCard)]), "Imported terms are not in the same order"],
  ])("rejects %s with a manifest-specific error", (_label, rawJson, expectedError) => {
    const result = parseExternalAiV3Import(rawJson, externalManifest);

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(" ")).toContain(expectedError);
  });

  it("keeps structurally valid cards available when only the order needs repair", () => {
    const result = parseExternalAiV3Import(
      externalPayload([externalCard(externalTerms[1]), externalCard(externalTerms[0]), ...externalTerms.slice(2).map(externalCard)]),
      externalManifest
    );

    expect(result).toMatchObject({ valid: false, comparison: { orderMismatches: expect.any(Array) } });
    if (!result.valid) expect(result.recoverableCards).toHaveLength(50);
  });

  it.each([
    ["missing required field", (() => { const cards = externalTerms.map(externalCard); delete (cards[0] as Partial<ReturnType<typeof externalCard>>).exampleVi; return externalPayload(cards); })(), "Missing exampleVi for \"external-term-1\"."],
    ["null required field", externalPayload([{ ...externalCard(externalTerms[0]), exampleVi: null }, ...externalTerms.slice(1).map(externalCard)]), "Missing exampleVi for \"external-term-1\"."],
    ["invalid POS", externalPayload([{ ...externalCard(externalTerms[0]), partOfSpeech: "noun/verb" }, ...externalTerms.slice(1).map(externalCard)]), "Invalid POS for \"external-term-1\"."],
    ["invalid CEFR", externalPayload([{ ...externalCard(externalTerms[0]), cefr: "B3" }, ...externalTerms.slice(1).map(externalCard)]), "Invalid CEFR for \"external-term-1\"."],
  ])("rejects %s", (_label, rawJson, expectedError) => {
    const result = parseExternalAiV3Import(rawJson, externalManifest);

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(" ")).toContain(expectedError);
  });
});

describe("External AI V3 review precondition", () => {
  it("requires a reviewed incoming-content fingerprint and identity version for an overwrite", () => {
    expect(externalAiV3ImportReviewSchema.safeParse({
      snapshots: [{ normalizedTerm: "apple", classification: "existing", flashcardId: "card-1", contentVersion: "2026-10-10T00:00:00.000Z" }],
      decisions: [{ flashcardId: "card-1", action: "overwrite" }],
    }).success).toBe(false);
    expect(externalAiV3ImportReviewSchema.safeParse({
      snapshots: [{ normalizedTerm: "apple", classification: "existing", incomingFingerprint: "a".repeat(64), flashcardId: "card-1", contentVersion: "2026-10-10T00:00:00.000Z" }],
      decisions: [{ flashcardId: "card-1", action: "overwrite" }],
    }).success).toBe(true);
  });
});
