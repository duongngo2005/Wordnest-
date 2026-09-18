import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { deckService } from "./deck-service";
import { storyService } from "./story-service";

describe("StoryService Integration with MySQL", () => {
  let testDeckId: string | null = null;
  let testStoryId: string | null = null;

  afterAll(async () => {
    if (testDeckId) {
      await db.deck.deleteMany({
        where: { id: testDeckId },
      });
    }
  });

  it("creates a deck, generates a story from target words, and persists to MySQL", async () => {
    // 1. Create base deck
    const deck = await deckService.createDeckWithCards(
      "apple; resilient; take responsibility",
      "Story Test Deck"
    );
    expect(deck).toBeDefined();
    testDeckId = deck!.id;

    // 2. Generate Story
    const story = await storyService.createStory({
      deckId: testDeckId,
      targetWords: ["apple", "resilient"],
      cefr: "B1",
      length: "medium",
      topic: "Daily Life",
    });

    expect(story).toBeDefined();
    expect(story.id).toBeDefined();
    expect(story.title).toBeDefined();
    expect(story.content.length).toBeGreaterThan(50);
    expect(story.cefr).toBe("B1");
    expect(story.topic).toBe("Daily Life");

    testStoryId = story.id;

    // 3. Verify story is queryable by deckId
    const stories = await storyService.getStoriesByDeckId(testDeckId);
    expect(stories.length).toBe(1);
    expect(stories[0].id).toBe(testStoryId);
  });

  it("adds a new flashcard from story text into the deck", async () => {
    expect(testDeckId).toBeDefined();

    const addResult = await storyService.addCardFromStory({
      deckId: testDeckId!,
      term: "discover",
      meaningVi: "khám phá, phát hiện",
      definitionEn: "to find something unexpectedly or during a search",
      ipa: "/dɪˈskʌv.ər/",
      partOfSpeech: "verb",
      cefr: "A2",
      exampleEn: "Maya went on a walk to discover new places.",
      exampleVi: "Maya đi dạo để khám phá những địa điểm mới.",
    });

    expect(addResult.success).toBe(true);
    expect(addResult.alreadyExists).toBe(false);
    expect(addResult.card.normalizedTerm).toBe("discover");

    // Verify deck card count increased from 3 to 4
    const updatedDeck = await deckService.getDeckById(testDeckId!);
    expect(updatedDeck?.cards.length).toBe(4);
  });

  it("prevents duplicate flashcards when adding from story", async () => {
    expect(testDeckId).toBeDefined();

    // Try adding "apple" which already exists
    const duplicateResult = await storyService.addCardFromStory({
      deckId: testDeckId!,
      term: "Apple",
      meaningVi: "quả táo",
      definitionEn: "a fruit",
      exampleEn: "She ate an apple.",
      exampleVi: "Cô ấy ăn một quả táo.",
    });

    expect(duplicateResult.success).toBe(false);
    expect(duplicateResult.alreadyExists).toBe(true);
    expect(duplicateResult.message).toContain("đã có trong bộ thẻ");

    // Verify count did NOT increase
    const deck = await deckService.getDeckById(testDeckId!);
    expect(deck?.cards.length).toBe(4);
  });
});
