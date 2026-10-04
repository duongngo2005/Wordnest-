import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deckService } from "./deck-service";
import { storyService } from "./story-service";

describe("StoryService historical data compatibility", () => {
  let testDeckId: string | null = null;

  afterAll(async () => {
    if (testDeckId) await db.deck.deleteMany({ where: { id: testDeckId } });
  });

  it("still reads a persisted Story and permits its historical card data to remain queryable", async () => {
    const deck = await deckService.createManualDeckWithCards({
      deckName: "Historical Story Test Deck",
      cards: [{ term: "apple", meaningVi: "quả táo" }],
    });
    testDeckId = deck!.id;

    const story = await db.story.create({
      data: {
        deckId: testDeckId,
        title: "An Apple on the Trail",
        content: "Maya packed an apple before a difficult hike.",
        cefr: "B1",
        length: "short",
        topic: "Travel",
        targetWords: {
          schemaVersion: 3,
          requestedTerms: ["apple"],
          usage: [{ term: "apple", usedAs: "apple" }],
          contextualTranslations: [{ term: "apple", usedAs: "apple", meaningVi: "quả táo" }],
          selectionTranslations: [],
        },
      },
    });

    await expect(storyService.getStoriesByDeckId(testDeckId)).resolves.toContainEqual(
      expect.objectContaining({ id: story.id, title: "An Apple on the Trail" })
    );
    await expect(storyService.getStoryById(story.id)).resolves.toMatchObject({ id: story.id, deckId: testDeckId });
  });

  it("keeps historical add-card duplicate protection intact", async () => {
    expect(testDeckId).toBeDefined();
    const duplicateResult = await storyService.addCardFromStory({
      deckId: testDeckId!,
      term: "Apple",
      meaningVi: "quả táo",
      definitionEn: "a fruit",
      exampleEn: "She ate an apple.",
      exampleVi: "Cô ấy ăn một quả táo.",
    });

    expect(duplicateResult).toMatchObject({ success: false, alreadyExists: true });
  });

  it("automatically detects vocabulary coverage when persisting a story without pre-populated usage array", async () => {
    expect(testDeckId).toBeDefined();
    const story = await storyService.persistGeneratedStory({
      deckId: testDeckId!,
      requestedTerms: ["apple"],
      cefr: "B1",
      length: "short",
      topic: "Daily Life",
      generated: {
        title: "Morning Routine",
        content: "Every morning, Lucas ate an apple before heading out to work.",
      },
    });

    expect(story.title).toBe("Morning Routine");
    const retrieved = await storyService.getStoryById(story.id);
    expect(retrieved).toBeDefined();
    const targetWords = retrieved?.targetWords as Record<string, unknown>;
    expect(targetWords.usage).toEqual([
      expect.objectContaining({ term: "apple", usedAs: "apple" }),
    ]);
  });
});

