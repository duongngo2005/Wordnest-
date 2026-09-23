import { describe, expect, it } from "vitest";
import { POST } from "./route";

const missingDeckContext = { params: Promise.resolve({ id: "missing-deck" }) };

describe("POST /api/decks/[id]/cards", () => {
  it("returns 400 when the vocabulary input is malformed", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      missingDeckContext
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it("returns 404 instead of creating a new deck when the target deck no longer exists", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawInput: "resilient" }),
      }),
      missingDeckContext
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
