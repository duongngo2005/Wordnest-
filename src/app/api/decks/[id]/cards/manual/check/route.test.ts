import { describe, expect, it } from "vitest";
import { POST } from "./route";

const missingDeckContext = { params: Promise.resolve({ id: "missing-deck" }) };

describe("POST /api/decks/[id]/cards/manual/check", () => {
  it("rejects an incomplete manual card before checking duplicates", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards/manual/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ card: { term: "" } }),
      }),
      missingDeckContext
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it("does not preview against a destination deck that no longer exists", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards/manual/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ card: { term: "study-check-word", meaningVi: "kiểm tra" } }),
      }),
      missingDeckContext
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
