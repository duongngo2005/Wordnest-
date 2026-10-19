import { describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
import { deckService } from "@/services/vocabulary";
import { DeckDeletionBlockedError } from "@/services/vocabulary/deck-service";

describe("DELETE /api/decks/[id]", () => {
  it("requires an impact preview fingerprint before deleting", async () => {
    const deleteDeck = vi.spyOn(deckService, "deleteDeck");
    try {
      const response = await DELETE(new Request("http://localhost/api/decks/deck-1", { method: "DELETE" }), {
        params: Promise.resolve({ id: "deck-1" }),
      });
      expect(response.status).toBe(400);
      expect(deleteDeck).not.toHaveBeenCalled();
    } finally {
      deleteDeck.mockRestore();
    }
  });

  it("returns the safe deletion impact when a populated deck is protected", async () => {
    const blocked = vi.spyOn(deckService, "deleteDeck").mockRejectedValue(
      new DeckDeletionBlockedError({
        fingerprint: "test-preview",
        flashcards: 3,
        sharedFlashcards: 1,
        unassignedFlashcards: 2,
        canonicalFlashcardsDeleted: 0,
        learningHistoriesDeleted: 0,
        reviewLogs: 4,
        practiceAttempts: 2,
        stories: 0,
        lessons: 0,
        quizAttempts: 0,
        quizSessions: 0,
      })
    );

    try {
      const response = await DELETE(new Request("http://localhost/api/decks/deck-1", {
        method: "DELETE",
        headers: { "x-wordnest-deletion-preview": "current-preview" },
      }), {
        params: Promise.resolve({ id: "deck-1" }),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        impact: { flashcards: 3, reviewLogs: 4, practiceAttempts: 2 },
      });
    } finally {
      blocked.mockRestore();
    }
  });
});
