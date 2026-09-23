import { describe, expect, it } from "vitest";
import { POST } from "./route";

const missingDeckContext = { params: Promise.resolve({ id: "missing-deck" }) };

describe("POST /api/decks/[id]/cards/json-import", () => {
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
});
