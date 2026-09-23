import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { deckService } from "@/services/vocabulary";
import { AIQuotaExceededError } from "@/services/ai/ai-core";

describe("POST /api/decks", () => {
  it("returns 400 for malformed JSON instead of treating it as a server failure", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it("returns a structured quota error that lets the client keep and move its input to manual mode", async () => {
    const createDeck = vi
      .spyOn(deckService, "createDeckWithCards")
      .mockRejectedValue(new AIQuotaExceededError());

    try {
      const response = await POST(
        new Request("http://localhost/api/decks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rawInput: "deploy; maintain" }),
        })
      );

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toMatchObject({
        code: "AI_QUOTA_EXCEEDED",
        canFallbackToManual: true,
      });
    } finally {
      createDeck.mockRestore();
    }
  });
});
