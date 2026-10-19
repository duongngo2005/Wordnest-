import { describe, expect, it } from "vitest";
import { POST } from "./route";

const missingDeckContext = { params: Promise.resolve({ id: "missing-deck" }) };

describe("POST /api/decks/[id]/cards/json-import", () => {
  it("accepts up to 50 existing-card links for an External AI V3 import", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards/json-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "import",
          mode: "external-ai-v3",
          manifest: { terms: ["apple"] },
          review: { snapshots: [{ normalizedTerm: "apple", classification: "new", incomingFingerprint: "a".repeat(64) }], decisions: [] },
          linkExistingCardIds: Array.from({ length: 50 }, (_, index) => `existing-card-${index + 1}`),
          rawJson: JSON.stringify({
            schemaVersion: 1,
            cards: [{
              term: "apple", meaningVi: "quả táo", partOfSpeech: "noun", ipa: null,
              definitionEn: "a round fruit with firm flesh",
              exampleEn: "She ate a fresh apple.",
              exampleVi: "Cô ấy ăn một quả táo tươi.", cefr: null, imageUrl: null,
            }],
          }),
        }),
      }),
      missingDeckContext
    );

    expect(response.status).toBe(404);
  });

  it("reports invalid JSON during preview without attempting an import", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards/json-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview", rawJson: "{" }),
      }),
      missingDeckContext
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { valid: false, errors: [expect.stringContaining("JSON không hợp lệ")] },
    });
  });

  it("does not create a deck when the destination no longer exists", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards/json-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "import",
          rawJson: JSON.stringify({ schemaVersion: 1, cards: [{ term: "apple", meaningVi: "quả táo" }] }),
        }),
      }),
      missingDeckContext
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it("returns manifest-specific V3 errors before looking up the destination deck", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards/json-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          mode: "external-ai-v3",
          manifest: { terms: ["abolish", "abortion"] },
          rawJson: JSON.stringify({
            schemaVersion: 1,
            cards: [{
              term: "abolish", meaningVi: "bãi bỏ", partOfSpeech: "verb", ipa: null,
              definitionEn: "to officially end a law or system",
              exampleEn: "The government abolished the rule.",
              exampleVi: "Chính phủ đã bãi bỏ quy định đó.", cefr: null, imageUrl: null,
            }],
          }),
        }),
      }),
      missingDeckContext
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, data: { valid: false } });
    expect(body.data.errors).toContain('Missing term: "abortion".');
  });
});
