import { describe, expect, it } from "vitest";
import { POST } from "./route";

const missingDeckContext = { params: Promise.resolve({ id: "missing-deck" }) };

describe("POST /api/decks/[id]/cards/manual/commit", () => {
  it("requires an explicit create or overwrite decision", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards/manual/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ card: { term: "study-commit-word", meaningVi: "xác nhận" } }),
      }),
      missingDeckContext
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it("does not write to a destination deck that no longer exists", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/missing-deck/cards/manual/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          card: { term: "study-commit-word", meaningVi: "xác nhận" },
          decision: { action: "create", incomingFingerprint: "a".repeat(64) },
        }),
      }),
      missingDeckContext
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
