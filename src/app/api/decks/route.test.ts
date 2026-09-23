import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { deckService } from "@/services/vocabulary";

describe("POST /api/decks", () => {
  it("returns 400 for malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/decks", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }));
    expect(response.status).toBe(400);
  });

  it("creates an empty deck without invoking an AI provider", async () => {
    const createDeck = vi.spyOn(deckService, "createDeck").mockResolvedValue({ id: "deck-1", name: "IT Vocabulary" } as never);
    try {
      const response = await POST(new Request("http://localhost/api/decks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "IT Vocabulary", folderId: null }) }));
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ success: true, deck: { id: "deck-1" } });
      expect(createDeck).toHaveBeenCalledWith({ name: "IT Vocabulary", folderId: null });
    } finally {
      createDeck.mockRestore();
    }
  });
});
