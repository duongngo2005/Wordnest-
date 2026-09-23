import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { deckService } from "./deck-service";
import { FlashcardStatus } from "@prisma/client";
import { aiService } from "@/services/ai";
import { AIQuotaExceededError } from "@/services/ai/ai-core";
import type { GeneratedFlashcardItem } from "@/lib/validation/flashcard";
import { DuplicateFlashcardTermError } from "./deck-service";

describe("DeckService Integration with MySQL", () => {
  it("creates a minimal manual deck without calling the AI service", async () => {
    const generateFlashcards = vi
      .spyOn(aiService, "generateFlashcards")
      .mockRejectedValue(new Error("AI keys are unavailable"));
    const deck = await deckService.createManualDeckWithCards({
      deckName: "Manual cards",
      cards: [{ term: "troubleshoot", meaningVi: "xử lý sự cố" }],
    });

    try {
      expect(generateFlashcards).not.toHaveBeenCalled();
      expect(deck?.cards).toHaveLength(1);
      expect(deck?.cards[0]).toMatchObject({
        term: "troubleshoot",
        meaningVi: "xử lý sự cố",
        definitionEn: null,
        exampleEn: null,
        exampleVi: null,
        status: FlashcardStatus.NEW,
      });
    } finally {
      generateFlashcards.mockRestore();
      if (deck) await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("adds multiple manual cards with optional details and skips duplicate terms", async () => {
    const deck = await db.deck.create({ data: { name: "Manual additions" } });
    try {
      const result = await deckService.createManualCards(deck.id, [
        {
          term: "deployment",
          meaningVi: "triển khai",
          definitionEn: "the act of putting something into use",
          exampleEn: "The deployment finished today.",
          exampleVi: "Việc triển khai đã hoàn tất hôm nay.",
          ipa: "/dɪˈplɔɪ.mənt/",
          partOfSpeech: "noun",
          cefr: "B2",
          imageUrl: "https://example.com/deployment.png",
        },
        { term: "reliable", meaningVi: "đáng tin cậy" },
        { term: "Reliable", meaningVi: "bản trùng" },
      ]);

      expect(result.cardsCreated).toBe(2);
      const cards = await db.flashcard.findMany({ where: { deckId: deck.id }, orderBy: { term: "asc" } });
      expect(cards).toHaveLength(2);
      expect(cards.find((card) => card.term === "deployment")).toMatchObject({
        imageSource: "MANUAL",
        definitionEn: "the act of putting something into use",
      });
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("creates AI drafts without writing cards or searching images, then persists only after confirmation", async () => {
    const deck = await db.deck.create({ data: { name: "AI draft preview" } });
    const generated: GeneratedFlashcardItem = {
      term: "allocate",
      meaningVi: "phân bổ",
      definitionEn: "to distribute something for a purpose",
      ipa: "/ˈæl.ə.keɪt/",
      partOfSpeech: "verb",
      cefr: "B2",
      exampleEn: "The team allocated resources carefully.",
      exampleVi: "Nhóm đã phân bổ nguồn lực cẩn thận.",
      visualScore: 20,
      imageSearchQuery: null,
      imageUseful: false,
    };
    const generateFlashcards = vi.spyOn(aiService, "generateFlashcards").mockResolvedValue([generated]);

    try {
      const draft = await deckService.generateAiCardDrafts(deck.id, "allocate");
      expect(draft.cards).toHaveLength(1);
      expect(draft.cards[0]).toMatchObject({ term: "allocate", meaningVi: "phân bổ" });
      expect(await db.flashcard.count({ where: { deckId: deck.id } })).toBe(0);

      await expect(deckService.persistAiCardDrafts(deck.id, draft.cards)).resolves.toMatchObject({ cardsCreated: 1 });
      const saved = await db.flashcard.findFirstOrThrow({ where: { deckId: deck.id } });
      expect(saved.imageUrl).toBeNull();
      expect(saved.imageSource).toBeNull();
    } finally {
      generateFlashcards.mockRestore();
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("leaves an AI destination deck unchanged when generation fails", async () => {
    const deck = await db.deck.create({ data: { name: "AI failure is safe" } });
    const generateFlashcards = vi
      .spyOn(aiService, "generateFlashcards")
      .mockRejectedValue(new AIQuotaExceededError());

    try {
      await expect(deckService.generateAiCardDrafts(deck.id, "deploy; maintain")).rejects.toThrow(AIQuotaExceededError);
      expect(await db.flashcard.count({ where: { deckId: deck.id } })).toBe(0);
    } finally {
      generateFlashcards.mockRestore();
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("rejects a stale AI preview as a whole instead of writing a partial batch", async () => {
    const deck = await db.deck.create({ data: { name: "AI stale preview" } });
    await deckService.createManualCards(deck.id, [{ term: "allocate", meaningVi: "phân bổ" }]);

    try {
      await expect(
        deckService.persistAiCardDrafts(deck.id, [
          { term: "allocate", meaningVi: "phân bổ" },
          { term: "resilient", meaningVi: "kiên cường" },
        ])
      ).rejects.toThrow("đã có trong bộ từ");
      expect(await db.flashcard.findMany({ where: { deckId: deck.id }, orderBy: { term: "asc" } })).toMatchObject([
        { term: "allocate" },
      ]);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("imports every valid JSON card atomically without invoking AI", async () => {
    const deck = await db.deck.create({ data: { name: "JSON import" } });
    const generateFlashcards = vi.spyOn(aiService, "generateFlashcards");
    const rawJson = JSON.stringify({
      schemaVersion: 1,
      cards: [
        { term: "apple", meaningVi: "quả táo", cefr: "A1", imageUrl: "https://images.example.com/apple.jpg" },
        { term: "perspective", meaningVi: "quan điểm; góc nhìn", cefr: null, imageUrl: null },
      ],
    });

    try {
      const result = await deckService.importJsonFlashcards(deck.id, rawJson);
      const cards = await db.flashcard.findMany({ where: { deckId: deck.id }, orderBy: { term: "asc" } });

      expect(result.cardsCreated).toBe(2);
      expect(cards).toHaveLength(2);
      expect(cards[0]).toMatchObject({ imageUrl: "https://images.example.com/apple.jpg", imageSource: "MANUAL" });
      expect(cards[1]).toMatchObject({ imageUrl: null, imageSource: null, status: FlashcardStatus.NEW });
      expect(generateFlashcards).not.toHaveBeenCalled();
    } finally {
      generateFlashcards.mockRestore();
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("rejects JSON duplicates and invalid cards without writing a partial import", async () => {
    const deck = await db.deck.create({ data: { name: "JSON import errors" } });
    try {
      await expect(deckService.importJsonFlashcards(deck.id, JSON.stringify({
        schemaVersion: 1,
        cards: [
          { term: "apple", meaningVi: "quả táo" },
          { term: " Apple ", meaningVi: "táo" },
        ],
      }))).rejects.toThrow("Duplicate");

      await expect(deckService.importJsonFlashcards(deck.id, JSON.stringify({
        schemaVersion: 1,
        cards: [
          { term: "banana", meaningVi: "quả chuối" },
          { term: "pear", meaningVi: "quả lê", cefr: "B3" },
        ],
      }))).rejects.toThrow("cards[1].cefr");

      expect(await db.flashcard.count({ where: { deckId: deck.id } })).toBe(0);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("treats terms already in the destination deck as a hard JSON import error", async () => {
    const deck = await db.deck.create({ data: { name: "JSON existing duplicate" } });
    await deckService.createManualCards(deck.id, [{ term: "apple", meaningVi: "quả táo" }]);

    try {
      await expect(deckService.importJsonFlashcards(deck.id, JSON.stringify({
        schemaVersion: 1,
        cards: [{ term: " Apple ", meaningVi: "táo" }],
      }))).rejects.toThrow("already exists");

      expect(await db.flashcard.count({ where: { deckId: deck.id } })).toBe(1);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("rolls back every pending JSON-style card when its transaction fails", async () => {
    const deck = await db.deck.create({ data: { name: "JSON transaction rollback" } });
    try {
      await expect(db.$transaction(async (tx) => {
        await tx.flashcard.createMany({
          data: [
            { deckId: deck.id, term: "apple", normalizedTerm: "apple", meaningVi: "quả táo", status: FlashcardStatus.NEW, state: 0, due: new Date() },
            { deckId: deck.id, term: "banana", normalizedTerm: "banana", meaningVi: "quả chuối", status: FlashcardStatus.NEW, state: 0, due: new Date() },
          ],
        });
        throw new Error("forced transaction failure");
      })).rejects.toThrow("forced transaction failure");

      expect(await db.flashcard.count({ where: { deckId: deck.id } })).toBe(0);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("edits lexical content without rewriting FSRS, review, practice, or story history", async () => {
    const deck = await db.deck.create({ data: { name: "Lexical edit integrity" } });
    const due = new Date("2026-08-01T10:00:00.000Z");
    const lastReviewAt = new Date("2026-07-28T10:00:00.000Z");
    const card = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "alocate",
        normalizedTerm: "alocate",
        meaningVi: "phân bổ",
        partOfSpeech: "verb",
        cefr: "B1",
        due,
        state: 2,
        status: FlashcardStatus.KNOWN,
        stability: 12.5,
        difficulty: 6.2,
        elapsedDays: 4,
        scheduledDays: 9,
        learningSteps: 3,
        reps: 8,
        lapses: 1,
        lastReviewAt,
        schedulerVersion: 7,
      },
    });
    await db.reviewLog.create({
      data: {
        cardId: card.id,
        rating: 3,
        state: 2,
        due,
        stability: 12.5,
        difficulty: 6.2,
        elapsedDays: 4,
        lastElapsedDays: 4,
        scheduledDays: 9,
        reviewEventId: crypto.randomUUID(),
      },
    });
    const attempt = await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "historical-practice",
        questionId: "q1",
        prompt: "phân bổ",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "alocate",
        expectedAnswer: "allocate",
      },
    });
    const story = await db.story.create({
      data: {
        deckId: deck.id,
        title: "Allocation",
        content: "The manager allocated more money.",
        cefr: "B1",
        length: "short",
        topic: "work",
        targetWords: { schemaVersion: 3, requestedTerms: ["alocate"], usage: [{ term: "alocate", usedAs: "allocated" }], contextualTranslations: [], selectionTranslations: [] },
      },
    });

    try {
      const schedulerBefore = await db.flashcard.findUniqueOrThrow({ where: { id: card.id } });
      const reviewBefore = await db.reviewLog.findMany({ where: { cardId: card.id } });
      const attemptBefore = await db.practiceAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      const storyBefore = await db.story.findUniqueOrThrow({ where: { id: story.id } });

      const updated = await deckService.updateCard(card.id, {
        term: " allocate ",
        meaningVi: "phân bổ nguồn lực",
        partOfSpeech: "verb",
        cefr: "B2",
        ipa: "/ˈæl.ə.keɪt/",
        definitionEn: "to distribute resources for a purpose",
        exampleEn: "The company allocated more money.",
        exampleVi: "Công ty đã phân bổ thêm tiền.",
        imageUrl: "https://images.example.com/allocate.jpg",
      });

      expect(updated).toMatchObject({ term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ nguồn lực", partOfSpeech: "verb", cefr: "B2" });
      const after = await db.flashcard.findUniqueOrThrow({ where: { id: card.id } });
      for (const field of ["due", "state", "status", "stability", "difficulty", "elapsedDays", "scheduledDays", "learningSteps", "reps", "lapses", "lastReviewAt", "schedulerVersion"] as const) {
        expect(after[field]).toEqual(schedulerBefore[field]);
      }
      expect(await db.reviewLog.findMany({ where: { cardId: card.id } })).toEqual(reviewBefore);
      expect(await db.practiceAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toEqual(attemptBefore);
      expect(await db.story.findUniqueOrThrow({ where: { id: story.id } })).toEqual(storyBefore);
      expect(await deckService.getStoryFlashcards(deck.id, ["alocate"])).toEqual([]);

      await expect(deckService.updateCard(card.id, { cefr: "B3" })).rejects.toThrow("CEFR phải là");
      await expect(deckService.updateCard(card.id, { partOfSpeech: "unsupported POS" })).rejects.toThrow("Từ loại không được hỗ trợ");

      const duplicate = await db.flashcard.create({
        data: { deckId: deck.id, term: "duplicate", normalizedTerm: "duplicate", meaningVi: "trùng" },
      });
      await expect(deckService.updateCard(card.id, { term: duplicate.term })).rejects.toBeInstanceOf(DuplicateFlashcardTermError);
      expect((await db.flashcard.findUniqueOrThrow({ where: { id: card.id } })).term).toBe("allocate");
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });
});
