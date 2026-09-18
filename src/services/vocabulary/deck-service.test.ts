import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { deckService } from "./deck-service";
import { FlashcardStatus } from "@prisma/client";

describe("DeckService Integration with MySQL", () => {
  let testDeckId: string | null = null;

  afterAll(async () => {
    if (testDeckId) {
      await db.deck.deleteMany({
        where: { id: testDeckId },
      });
    }
  });

  it("creates a deck with cards and persists to database", async () => {
    const rawInput = "apple; resilient; take responsibility; reluctant";
    const deck = await deckService.createDeckWithCards(rawInput, "Test Suite Deck");

    expect(deck).toBeDefined();
    expect(deck?.name).toBe("Test Suite Deck");
    expect(deck?.cards.length).toBe(4);
    expect(deck?.stats.totalCards).toBe(4);
    expect(deck?.stats.newCount).toBe(4);
    expect(deck?.stats.learningCount).toBe(0);
    expect(deck?.stats.knownCount).toBe(0);

    testDeckId = deck!.id;

    // Verify cards have IPA, examples, and meanings
    const appleCard = deck!.cards.find((c) => c.normalizedTerm === "apple");
    expect(appleCard).toBeDefined();
    expect(appleCard?.meaningVi).toContain("táo");
    expect(appleCard?.status).toBe(FlashcardStatus.NEW);

    const resilientCard = deck!.cards.find((c) => c.normalizedTerm === "resilient");
    expect(resilientCard).toBeDefined();
    expect(resilientCard?.cefr).toBe("B2");
  });

  it("updates card status correctly to LEARNING and KNOWN", async () => {
    expect(testDeckId).toBeDefined();
    const deck = await deckService.getDeckById(testDeckId!);
    expect(deck).toBeDefined();

    const card1 = deck!.cards[0];
    const card2 = deck!.cards[1];

    // Mark card1 as LEARNING
    await deckService.updateCardStatus(card1.id, FlashcardStatus.LEARNING);
    // Mark card2 as KNOWN
    await deckService.updateCardStatus(card2.id, FlashcardStatus.KNOWN);

    const updatedDeck = await deckService.getDeckById(testDeckId!);
    expect(updatedDeck?.stats.newCount).toBe(2);
    expect(updatedDeck?.stats.learningCount).toBe(1);
    expect(updatedDeck?.stats.knownCount).toBe(1);
  });
});
