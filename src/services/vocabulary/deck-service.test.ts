import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { deckService } from "./deck-service";
import { FlashcardStatus } from "@prisma/client";
import { practiceEvidenceService } from "./practice-evidence-service";
import {
  AmbiguousVocabularyIdentityError,
  DuplicateFlashcardTermError,
  JsonFlashcardImportError,
  StaleManualFlashcardDuplicatePreviewError,
  StaleJsonFlashcardImportPreviewError,
  StaleDeletionPreviewError,
} from "./deck-service";

describe("DeckService Integration with SQLite", () => {
  it("rejects a stale deck-deletion preview without mutating the deck", async () => {
    const deck = await db.deck.create({ data: { name: "Stale deck deletion preview" } });
    const firstTerm = `stale-preview-first-${crypto.randomUUID()}`;
    const secondTerm = `stale-preview-second-${crypto.randomUUID()}`;
    const firstCard = await db.flashcard.create({
      data: { deckId: deck.id, term: firstTerm, normalizedTerm: firstTerm, meaningVi: "đầu tiên" },
    });

    try {
      const preview = await deckService.getDeckDeletionImpact(deck.id);
      await db.flashcard.create({
        data: { deckId: deck.id, term: secondTerm, normalizedTerm: secondTerm, meaningVi: "thứ hai" },
      });

      await expect(deckService.deleteDeck(deck.id, preview.fingerprint)).rejects.toBeInstanceOf(StaleDeletionPreviewError);
      await expect(db.deck.findUnique({ where: { id: deck.id } })).resolves.not.toBeNull();
      await expect(db.flashcard.findUnique({ where: { id: firstCard.id } })).resolves.not.toBeNull();
    } finally {
      await db.deck.delete({ where: { id: deck.id } }).catch(() => undefined);
      await db.flashcard.deleteMany({ where: { normalizedTerm: { in: [firstTerm, secondTerm] } } });
    }
  });

  it("removes a Deck source while preserving the canonical card and learning evidence", async () => {
    const deck = await db.deck.create({ data: { name: "Protected deck deletion" } });
    const term = `protected-delete-${crypto.randomUUID()}`;
    const card = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term,
        normalizedTerm: term,
        meaningVi: "được bảo vệ",
      },
    });

    try {
      await db.reviewLog.create({
        data: {
          cardId: card.id,
          rating: 3,
          state: 0,
          due: new Date(),
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          lastElapsedDays: 0,
          scheduledDays: 0,
          reviewEventId: crypto.randomUUID(),
        },
      });
      await db.practiceAttempt.create({
        data: {
          flashcardId: card.id,
          sessionId: crypto.randomUUID(),
          mode: "flashcard",
          questionType: "recognition",
          correct: true,
          answer: "protected",
          expectedAnswer: "protected",
        },
      });

      await expect(deckService.deleteDeck(deck.id)).resolves.toMatchObject({ id: deck.id });
      await expect(db.deck.findUnique({ where: { id: deck.id } })).resolves.toBeNull();
      await expect(db.flashcard.findUnique({ where: { id: card.id } })).resolves.toMatchObject({ id: card.id, deckId: null });
      await expect(db.deckVocabularyMembership.count({ where: { flashcardId: card.id } })).resolves.toBe(0);
      await expect(db.reviewLog.count({ where: { cardId: card.id } })).resolves.toBe(1);
      await expect(db.practiceAttempt.count({ where: { flashcardId: card.id } })).resolves.toBe(1);
    } finally {
      await db.flashcard.delete({ where: { id: card.id } });
    }
  });

  it("allows deletion of a deck with no dependent data", async () => {
    const deck = await db.deck.create({ data: { name: "Empty deck deletion" } });
    await expect(deckService.deleteDeck(deck.id)).resolves.toMatchObject({ id: deck.id });
    await expect(db.deck.findUnique({ where: { id: deck.id } })).resolves.toBeNull();
  });

  it("links one canonical card to two Decks without duplicating its FSRS or review history", async () => {
    const source = await db.deck.create({ data: { name: "Shared vocabulary source" } });
    const target = await db.deck.create({ data: { name: "Shared vocabulary target" } });
    const term = `shared-vocabulary-${crypto.randomUUID()}`;
    const card = await db.flashcard.create({
      data: { deckId: source.id, term, normalizedTerm: term, meaningVi: "dùng chung" },
    });

    try {
      await db.reviewLog.create({
        data: {
          cardId: card.id, rating: 3, state: 0, due: new Date(), stability: 0, difficulty: 0,
          elapsedDays: 0, lastElapsedDays: 0, scheduledDays: 0, reviewEventId: crypto.randomUUID(),
        },
      });
      await expect(deckService.linkExistingVocabularyToDeck(target.id, card.id)).resolves.toMatchObject({ linked: true });
      await expect(deckService.linkExistingVocabularyToDeck(target.id, card.id)).resolves.toMatchObject({ alreadyLinked: true });
      await expect(db.deckVocabularyMembership.count({ where: { flashcardId: card.id } })).resolves.toBe(2);
      await expect(deckService.getDeckById(target.id)).resolves.toMatchObject({
        cards: [expect.objectContaining({
          id: card.id,
          sources: expect.arrayContaining([
            expect.objectContaining({ deckId: source.id }),
            expect.objectContaining({ deckId: target.id }),
          ]),
        })],
      });
      await db.practiceAttempt.create({
        data: {
          flashcardId: card.id,
          sessionId: crypto.randomUUID(),
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "sai",
          expectedAnswer: term,
        },
      });
      await expect(practiceEvidenceService.getDeckMistakes(target.id)).resolves.toMatchObject({
        mistakes: [expect.objectContaining({ flashcardId: card.id })],
      });

      await deckService.deleteDeck(source.id);
      await expect(db.flashcard.findUnique({ where: { id: card.id } })).resolves.toMatchObject({ id: card.id });
      await expect(db.deckVocabularyMembership.findUnique({ where: { deckId_flashcardId: { deckId: target.id, flashcardId: card.id } } })).resolves.not.toBeNull();
      await expect(db.reviewLog.count({ where: { cardId: card.id } })).resolves.toBe(1);
    } finally {
      await db.deck.delete({ where: { id: target.id } }).catch(() => undefined);
      await db.flashcard.delete({ where: { id: card.id } }).catch(() => undefined);
    }
  });

  it("atomically creates one membership when two requests link the same vocabulary", async () => {
    const source = await db.deck.create({ data: { name: "Concurrent source membership" } });
    const target = await db.deck.create({ data: { name: "Concurrent target membership" } });
    const term = `concurrent-membership-${crypto.randomUUID()}`;
    const card = await db.flashcard.create({
      data: { deckId: source.id, term, normalizedTerm: term, meaningVi: "đồng thời" },
    });

    try {
      const results = await Promise.all([
        deckService.linkExistingVocabularyToDeck(target.id, card.id),
        deckService.linkExistingVocabularyToDeck(target.id, card.id),
      ]);

      expect(results.filter((result) => result.linked)).toHaveLength(1);
      expect(results.filter((result) => result.alreadyLinked)).toHaveLength(1);
      await expect(db.deckVocabularyMembership.count({
        where: { deckId: target.id, flashcardId: card.id },
      })).resolves.toBe(1);
    } finally {
      await db.deck.delete({ where: { id: target.id } }).catch(() => undefined);
      await db.deck.delete({ where: { id: source.id } }).catch(() => undefined);
      await db.flashcard.delete({ where: { id: card.id } }).catch(() => undefined);
    }
  });

  it("refuses to choose a historical duplicate record for a new source", async () => {
    const source = await db.deck.create({ data: { name: "Ambiguous identity source" } });
    const target = await db.deck.create({ data: { name: "Ambiguous identity target" } });
    const term = `productive-historical-${crypto.randomUUID()}`;
    const card = await db.flashcard.create({
      data: { deckId: source.id, term, normalizedTerm: term, meaningVi: "năng suất" },
    });

    try {
      await db.vocabularyIdentity.update({
        where: { normalizedTerm: term },
        data: { canonicalFlashcardId: null, hasHistoricalDuplicates: true, historicalDuplicateCount: 2 },
      });
      await expect(deckService.linkExistingVocabularyToDeck(target.id, card.id)).rejects.toBeInstanceOf(AmbiguousVocabularyIdentityError);
      await expect(db.deckVocabularyMembership.count({ where: { flashcardId: card.id } })).resolves.toBe(1);
    } finally {
      await db.flashcard.delete({ where: { id: card.id } }).catch(() => undefined);
      await db.deck.delete({ where: { id: source.id } }).catch(() => undefined);
      await db.deck.delete({ where: { id: target.id } }).catch(() => undefined);
    }
  });

  it("creates a minimal manual deck without requiring an AI service", async () => {
    const deck = await deckService.createManualDeckWithCards({
      deckName: "Manual cards",
      cards: [{ term: "troubleshoot", meaningVi: "xử lý sự cố" }],
    });

    try {
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

  it("imports every valid JSON card atomically", async () => {
    const deck = await db.deck.create({ data: { name: "JSON import" } });
    const rawJson = JSON.stringify({
      schemaVersion: 1,
      cards: [
        { term: "json-import-apple", meaningVi: "quả táo", cefr: "A1", imageUrl: "https://images.example.com/apple.jpg" },
        { term: "json-import-pineapple", meaningVi: "quả dứa", cefr: null, imageUrl: null },
      ],
    });

    try {
      const result = await deckService.importJsonFlashcards(deck.id, rawJson);
      const cards = await db.flashcard.findMany({ where: { deckId: deck.id }, orderBy: { term: "asc" } });

      expect(result.cardsCreated).toBe(2);
      expect(cards).toHaveLength(2);
      expect(cards[0]).toMatchObject({ imageUrl: "https://images.example.com/apple.jpg", imageSource: "MANUAL" });
      expect(cards[1]).toMatchObject({ imageUrl: null, imageSource: null, status: FlashcardStatus.NEW });
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("rejects invalid cards when JSON schema validation fails", async () => {
    const deck = await db.deck.create({ data: { name: "JSON import schema errors" } });
    try {
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

  it("skips batch duplicate cards gracefully during JSON import and logs the duplicate", async () => {
    const deck = await db.deck.create({ data: { name: "JSON batch duplicate" } });
    try {
      const result = await deckService.importJsonFlashcards(deck.id, JSON.stringify({
        schemaVersion: 1,
        cards: [
          { term: "apple", meaningVi: "quả táo" },
          { term: " Apple ", meaningVi: "táo" },
        ],
      }));

      expect(result.cardsCreated).toBe(1);
      expect(result.skippedDuplicates).toHaveLength(1);
      expect(result.skippedDuplicates[0].term).toBe("Apple");
      expect(result.skippedDuplicates[0].reason).toContain("Trùng lặp với từ khác trong danh sách đang nhập");
      expect(await db.flashcard.count({ where: { deckId: deck.id } })).toBe(1);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("prevents the same normalized term in a different deck during JSON import", async () => {
    const deck1 = await db.deck.create({ data: { name: "Deck A" } });
    const deck2 = await db.deck.create({ data: { name: "Deck B" } });
    await deckService.createManualCards(deck1.id, [{ term: "apple", meaningVi: "quả táo" }]);

    try {
      const result = await deckService.importJsonFlashcards(deck2.id, JSON.stringify({
        schemaVersion: 1,
        cards: [
          { term: " Apple ", meaningVi: "táo" },
          { term: "banana", meaningVi: "quả chuối" },
        ],
      }));

      expect(result.cardsCreated).toBe(1);
      expect(result.skippedDuplicates).toHaveLength(1);
      expect(result.skippedDuplicates[0].reason).toContain("Đã tồn tại");
      expect(await db.flashcard.findMany({ where: { deckId: deck2.id } })).toMatchObject([{ term: "banana" }]);
    } finally {
      await db.deck.delete({ where: { id: deck1.id } });
      await db.deck.delete({ where: { id: deck2.id } });
    }
  });

  it("rolls back every pending JSON-style card when its transaction fails", async () => {
    const deck = await db.deck.create({ data: { name: "JSON transaction rollback" } });
    try {
      const firstTerm = `rollback-apple-${crypto.randomUUID()}`;
      const secondTerm = `rollback-banana-${crypto.randomUUID()}`;
      await expect(db.$transaction(async (tx) => {
        await tx.flashcard.create({
          data: { deckId: null, term: firstTerm, normalizedTerm: firstTerm, meaningVi: "quả táo", status: FlashcardStatus.NEW, state: 0, due: new Date() },
        });
        await tx.flashcard.create({
          data: { deckId: null, term: secondTerm, normalizedTerm: secondTerm, meaningVi: "quả chuối", status: FlashcardStatus.NEW, state: 0, due: new Date() },
        });
        throw new Error("forced transaction failure");
      })).rejects.toThrow("forced transaction failure");

      expect(await db.flashcard.count({ where: { normalizedTerm: { in: [firstTerm, secondTerm] } } })).toBe(0);
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
        term: " alocate-refined ",
        meaningVi: "phân bổ nguồn lực",
        partOfSpeech: "verb",
        cefr: "B2",
        ipa: "/ˈæl.ə.keɪt/",
        definitionEn: "to distribute resources for a purpose",
        exampleEn: "The company allocated more money.",
        exampleVi: "Công ty đã phân bổ thêm tiền.",
        imageUrl: "https://images.example.com/allocate.jpg",
      });

      expect(updated).toMatchObject({ term: "alocate-refined", normalizedTerm: "alocate-refined", meaningVi: "phân bổ nguồn lực", partOfSpeech: "verb", cefr: "B2" });
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
      expect((await db.flashcard.findUniqueOrThrow({ where: { id: card.id } })).term).toBe("alocate-refined");

      const deck2 = await db.deck.create({ data: { name: "Deck Other" } });
      try {
        await db.flashcard.create({
          data: { deckId: deck2.id, term: "unique-word", normalizedTerm: "unique-word", meaningVi: "từ độc nhất" },
        });
      await expect(deckService.updateCard(card.id, { term: "unique-word" })).rejects.toBeInstanceOf(DuplicateFlashcardTermError);
      } finally {
        await db.deck.delete({ where: { id: deck2.id } });
      }
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("prevents the same term in another deck when manually adding cards", async () => {
    const deckA = await db.deck.create({ data: { name: "Vocabulary A" } });
    const deckB = await db.deck.create({ data: { name: "Vocabulary B" } });
    try {
      await deckService.createManualCards(deckA.id, [{ term: "persist-manual-unique", meaningVi: "độc nhất" }]);

      const result = await deckService.createManualCards(deckB.id, [
        { term: "persist-manual-unique", meaningVi: "độc nhất" },
        { term: "persist-manual-second", meaningVi: "thứ hai" },
      ]);

      expect(result.cardsCreated).toBe(1);
      expect(result.skippedDuplicates).toHaveLength(1);

      const cardsB = await db.flashcard.findMany({ where: { deckId: deckB.id } });
      expect(cardsB).toHaveLength(1);
      expect(cardsB.map((card) => card.term).sort()).toEqual(["persist-manual-second"]);
    } finally {
      await db.deck.delete({ where: { id: deckA.id } });
      await db.deck.delete({ where: { id: deckB.id } });
    }
  });

  it("keeps globally existing terms visible while offering only new legacy-import terms", async () => {
    const deckA = await db.deck.create({ data: { name: "Source Deck" } });
    const deckB = await db.deck.create({ data: { name: "Target Deck" } });
    try {
      await deckService.createManualCards(deckA.id, [{ term: "existing-system-word", meaningVi: "đã có" }]);

      const preview = await deckService.previewJsonFlashcardImport(
        deckB.id,
        JSON.stringify({
          schemaVersion: 1,
          cards: [
            { term: "existing-system-word", meaningVi: "nghĩa khác" },
            { term: "new-system-word", meaningVi: "từ mới" },
          ],
        })
      );

      expect(preview.valid).toBe(true);
      expect(preview.cards).toHaveLength(2);
      expect(preview.cards.map((card) => card.term)).toEqual(["existing-system-word", "new-system-word"]);
      expect(preview.skippedCards).toHaveLength(0);
      expect(preview.newCards).toMatchObject([{ term: "new-system-word" }]);
      expect(preview.existingCards).toMatchObject([{ term: "existing-system-word", existingDeckId: deckA.id, contentConflictFields: ["meaningVi"] }]);
    } finally {
      await db.deck.delete({ where: { id: deckA.id } });
      await db.deck.delete({ where: { id: deckB.id } });
    }
  });

  it("strictly previews and saves a manifest-matched External AI V3 batch", async () => {
    const deck = await db.deck.create({ data: { name: "External AI V3" } });
    const terms = Array.from({ length: 50 }, (_, index) => `external-v3-${index + 1}`);
    const rawJson = JSON.stringify({
      schemaVersion: 1,
      cards: terms.map((term) => ({
        term, meaningVi: `nghĩa ${term}`, partOfSpeech: "noun", ipa: null,
        definitionEn: `a clear definition for ${term}`,
        exampleEn: `This is an example of ${term}.`,
        exampleVi: `Đây là ví dụ về ${term}.`,
        cefr: null, imageUrl: null,
      })),
    });
    try {
      const preview = await deckService.previewJsonFlashcardImport(deck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms },
      });
      expect(preview).toMatchObject({ valid: true, mode: "external-ai-v3", manifest: { isExactMatch: true } });
      expect(preview.cards).toHaveLength(50);
      expect(preview.reviewSnapshots).toHaveLength(50);

      const firstSave = await deckService.importJsonFlashcards(deck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms }, review: { snapshots: preview.reviewSnapshots!, decisions: [] },
      });
      const repeatPreview = await deckService.previewJsonFlashcardImport(deck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms },
      });
      const repeatedSave = await deckService.importJsonFlashcards(deck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms }, review: { snapshots: repeatPreview.reviewSnapshots!, decisions: [] },
      });

      expect(firstSave.cardsCreated).toBe(50);
      expect(repeatedSave).toMatchObject({ cardsCreated: 0, existingKept: 50 });
      expect(await db.flashcard.count({ where: { deckId: deck.id } })).toBe(50);
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("keeps all 30 manifest cards visible while saving only globally new External AI V3 terms", async () => {
    const sourceDeck = await db.deck.create({ data: { name: "External V3 mixed source" } });
    const targetDeck = await db.deck.create({ data: { name: "External V3 mixed target" } });
    const terms = Array.from({ length: 30 }, (_, index) => `external-v3-mixed-${index + 1}`);
    await deckService.createManualCards(sourceDeck.id, terms.slice(0, 8).map((term) => ({ term, meaningVi: `nghĩa cũ ${term}` })));
    const rawJson = JSON.stringify({
      schemaVersion: 1,
      cards: terms.map((term) => ({
        term, meaningVi: `nghĩa ${term}`, partOfSpeech: "noun", ipa: null,
        definitionEn: `a clear definition for ${term}`,
        exampleEn: `This is an example of ${term}.`,
        exampleVi: `Đây là ví dụ về ${term}.`, cefr: null, imageUrl: null,
      })),
    });

    try {
      const preview = await deckService.previewJsonFlashcardImport(targetDeck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms },
      });
      expect(preview).toMatchObject({ valid: true, manifest: { isExactMatch: true } });
      expect(preview.cards).toHaveLength(30);
      expect(preview.newCards).toHaveLength(22);
      expect(preview.existingCards).toHaveLength(8);
      expect(preview.reviewSnapshots).toHaveLength(30);

      const saved = await deckService.importJsonFlashcards(targetDeck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms }, review: { snapshots: preview.reviewSnapshots!, decisions: [] },
      });
      expect(saved.cardsCreated).toBe(22);
      // External AI V3 keeps existing global vocabulary out of the target
      // deck entirely; it is accounted for as a decision, not a newly linked
      // card or a duplicate created by this import.
      expect(saved.skippedDuplicates.some((duplicate) => duplicate.term === terms[0])).toBe(false);
      expect(saved.skippedDuplicates).toHaveLength(0);
      expect("existingKept" in saved && saved.existingKept).toBe(8);
      expect(saved.linkedExistingCards).toBe(0);
      expect(await db.flashcard.count({ where: { normalizedTerm: { in: terms } } })).toBe(30);
    } finally {
      await db.deck.delete({ where: { id: sourceDeck.id } });
      await db.deck.delete({ where: { id: targetDeck.id } });
    }
  });

  it("keeps an External AI V3 term already in the target deck visible and preserves its existing membership", async () => {
    const deck = await db.deck.create({ data: { name: "External AI V3 duplicates" } });
    const terms = ["external-v3-existing"];
    await deckService.createManualCards(deck.id, [{ term: terms[0], meaningVi: "đã có" }]);
    const rawJson = JSON.stringify({
      schemaVersion: 1,
      cards: [{
        term: terms[0], meaningVi: "nghĩa mới", partOfSpeech: "noun", ipa: null,
        definitionEn: "a replacement definition", exampleEn: "This is an example.", exampleVi: "Đây là một ví dụ.", cefr: null, imageUrl: null,
      }],
    });

    try {
      const preview = await deckService.previewJsonFlashcardImport(deck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms },
      });
      expect(preview).toMatchObject({ valid: true, cards: [{ term: terms[0] }], newCards: [], existingCards: [{ term: terms[0] }] });
      expect(preview.errors).toEqual([]);
      const existing = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: terms[0] } });
      const membershipBefore = await db.deckVocabularyMembership.findUniqueOrThrow({ where: { deckId_flashcardId: { deckId: deck.id, flashcardId: existing.id } } });
      await expect(deckService.importJsonFlashcards(deck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms }, review: { snapshots: preview.reviewSnapshots!, decisions: [] },
      })).resolves.toMatchObject({ cardsCreated: 0, existingKept: 1, linkedExistingCards: 0 });
      expect(await db.deckVocabularyMembership.findUniqueOrThrow({ where: { deckId_flashcardId: { deckId: deck.id, flashcardId: existing.id } } })).toEqual(membershipBefore);
      expect(await db.flashcard.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ meaningVi: "đã có" });
    } finally {
      await db.deck.delete({ where: { id: deck.id } });
    }
  });

  it("classifies an External AI V3 term in another deck as existing, not malformed", async () => {
    const sourceDeck = await db.deck.create({ data: { name: "External AI V3 source" } });
    const targetDeck = await db.deck.create({ data: { name: "External AI V3 target" } });
    const terms = ["external-v3-cross-deck"];
    await deckService.createManualCards(sourceDeck.id, [{ term: terms[0], meaningVi: "đã có ở deck khác" }]);
    const rawJson = JSON.stringify({
      schemaVersion: 1,
      cards: [{
        term: terms[0], meaningVi: "có thể học ở deck này", partOfSpeech: "noun", ipa: null,
        definitionEn: "a word kept in a separate study set", exampleEn: "This card belongs to another deck.",
        exampleVi: "Thẻ này thuộc một bộ thẻ khác.", cefr: null, imageUrl: null,
      }],
    });

    try {
      const preview = await deckService.previewJsonFlashcardImport(targetDeck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms },
      });
      expect(preview).toMatchObject({ valid: true, newCards: [], existingCards: [{ term: terms[0], existingDeckId: sourceDeck.id }] });

      await expect(deckService.importJsonFlashcards(targetDeck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms }, review: { snapshots: preview.reviewSnapshots!, decisions: [] },
      })).resolves.toMatchObject({ cardsCreated: 0, existingKept: 1, linkedExistingCards: 0 });
    } finally {
      await db.deck.delete({ where: { id: sourceDeck.id } });
      await db.deck.delete({ where: { id: targetDeck.id } });
    }
  });

  it("imports 42 new terms, overwrites 3 canonical cards, and keeps 5 without changing history or target memberships", async () => {
    const sourceDeck = await db.deck.create({ data: { name: "External V3 safety source" } });
    const targetDeck = await db.deck.create({ data: { name: "External V3 safety target" } });
    const prefix = `external-v3-42-8-${crypto.randomUUID()}`;
    const terms = Array.from({ length: 50 }, (_, index) => `${prefix}-${index + 1}`);
    const existingTerms = terms.slice(0, 8);
    const rawJson = JSON.stringify({
      schemaVersion: 1,
      cards: terms.map((term) => ({
        term,
        meaningVi: `nghĩa AI mới ${term}`,
        partOfSpeech: "noun",
        ipa: null,
        definitionEn: `a concise new definition for ${term}`,
        exampleEn: `This is the new example for ${term}.`,
        exampleVi: `Đây là ví dụ mới cho ${term}.`,
        cefr: null,
        imageUrl: null,
      })),
    });

    try {
      await deckService.createManualCards(sourceDeck.id, existingTerms.map((term) => ({
        term,
        meaningVi: `nghĩa cũ ${term}`,
        partOfSpeech: "noun",
        ipa: "/old/",
        cefr: "B1",
      })));
      const canonicalCards = await db.flashcard.findMany({ where: { normalizedTerm: { in: existingTerms } }, orderBy: { normalizedTerm: "asc" } });
      const protectedCard = canonicalCards[0];
      await db.flashcard.update({
        where: { id: protectedCard.id },
        data: { state: 2, reps: 9, lapses: 2, stability: 15, difficulty: 6, schedulerVersion: 4, due: new Date("2027-01-01T00:00:00.000Z") },
      });
      const review = await db.reviewLog.create({
        data: { cardId: protectedCard.id, rating: 3, state: 2, due: new Date("2027-01-01T00:00:00.000Z"), stability: 15, difficulty: 6, elapsedDays: 4, lastElapsedDays: 4, scheduledDays: 10, reviewEventId: crypto.randomUUID() },
      });
      const attempt = await db.practiceAttempt.create({
        data: { flashcardId: protectedCard.id, sessionId: crypto.randomUUID(), mode: "quiz", questionType: "typed_vi_en", correct: true, answer: protectedCard.term, expectedAnswer: protectedCard.term },
      });
      const before = await db.flashcard.findUniqueOrThrow({ where: { id: protectedCard.id } });
      const membershipsBefore = await db.deckVocabularyMembership.findMany({ where: { flashcardId: { in: canonicalCards.map((card) => card.id) } }, orderBy: { id: "asc" } });

      const preview = await deckService.previewJsonFlashcardImport(targetDeck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms },
      });
      expect(preview).toMatchObject({ valid: true });
      expect(preview.newCards).toHaveLength(42);
      expect(preview.existingCards).toHaveLength(8);
      const snapshots = preview.reviewSnapshots!;
      const overwriteIds = snapshots.filter((snapshot) => snapshot.classification === "existing").slice(0, 3).map((snapshot) => snapshot.flashcardId!);

      const saved = await deckService.importJsonFlashcards(targetDeck.id, rawJson, {
        mode: "external-ai-v3",
        manifest: { terms },
        review: { snapshots, decisions: overwriteIds.map((flashcardId) => ({ flashcardId, action: "overwrite" as const, confirmsPartOfSpeechChange: false })) },
      });

      expect(saved).toMatchObject({ cardsCreated: 42, existingUpdated: 3, existingKept: 5, linkedExistingCards: 0, ambiguousSkipped: 0 });
      expect(await db.deckVocabularyMembership.count({ where: { deckId: targetDeck.id } })).toBe(42);
      expect(await db.deckVocabularyMembership.count({ where: { deckId: targetDeck.id, flashcardId: { in: canonicalCards.map((card) => card.id) } } })).toBe(0);
      expect(await db.flashcard.count({ where: { normalizedTerm: { in: terms } } })).toBe(50);

      const afterProtected = await db.flashcard.findUniqueOrThrow({ where: { id: protectedCard.id } });
      expect(afterProtected).toMatchObject({ id: before.id, meaningVi: `nghĩa AI mới ${protectedCard.term}` });
      for (const field of ["due", "state", "status", "stability", "difficulty", "elapsedDays", "scheduledDays", "learningSteps", "reps", "lapses", "lastReviewAt", "schedulerVersion"] as const) {
        expect(afterProtected[field]).toEqual(before[field]);
      }
      expect(await db.reviewLog.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ id: review.id, cardId: protectedCard.id });
      expect(await db.practiceAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({ id: attempt.id, flashcardId: protectedCard.id });
      expect(await db.deckVocabularyMembership.findMany({ where: { flashcardId: { in: canonicalCards.map((card) => card.id) } }, orderBy: { id: "asc" } })).toEqual(membershipsBefore);
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: { in: terms } } });
      await db.deck.delete({ where: { id: sourceDeck.id } }).catch(() => undefined);
      await db.deck.delete({ where: { id: targetDeck.id } }).catch(() => undefined);
    }
  });

  it("updates one shared canonical flashcard across three Decks without linking it into the V3 target", async () => {
    const sourceDeck = await db.deck.create({ data: { name: "External V3 shared source" } });
    const firstSharedDeck = await db.deck.create({ data: { name: "External V3 shared first" } });
    const secondSharedDeck = await db.deck.create({ data: { name: "External V3 shared second" } });
    const targetDeck = await db.deck.create({ data: { name: "External V3 shared target" } });
    const term = `external-v3-shared-${crypto.randomUUID()}`;
    const rawJson = JSON.stringify({ schemaVersion: 1, cards: [{ term, meaningVi: "nội dung dùng chung mới", partOfSpeech: "noun", ipa: null, definitionEn: "a replacement shared definition", exampleEn: "This shared card changed once.", exampleVi: "Thẻ dùng chung được đổi một lần.", cefr: null, imageUrl: null }] });

    try {
      await deckService.createManualCards(sourceDeck.id, [{ term, meaningVi: "nội dung dùng chung cũ", partOfSpeech: "noun" }]);
      const card = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: term } });
      await deckService.linkExistingVocabularyToDeck(firstSharedDeck.id, card.id);
      await deckService.linkExistingVocabularyToDeck(secondSharedDeck.id, card.id);
      const membershipsBefore = await db.deckVocabularyMembership.findMany({ where: { flashcardId: card.id }, orderBy: { id: "asc" } });
      const preview = await deckService.previewJsonFlashcardImport(targetDeck.id, rawJson, { mode: "external-ai-v3", manifest: { terms: [term] } });
      const saved = await deckService.importJsonFlashcards(targetDeck.id, rawJson, {
        mode: "external-ai-v3",
        manifest: { terms: [term] },
        review: { snapshots: preview.reviewSnapshots!, decisions: [{ flashcardId: card.id, action: "overwrite", confirmsPartOfSpeechChange: false }] },
      });

      expect(saved).toMatchObject({ cardsCreated: 0, existingUpdated: 1, linkedExistingCards: 0 });
      expect(await db.flashcard.findUniqueOrThrow({ where: { id: card.id } })).toMatchObject({ id: card.id, meaningVi: "nội dung dùng chung mới" });
      expect(await db.deckVocabularyMembership.findMany({ where: { flashcardId: card.id }, orderBy: { id: "asc" } })).toEqual(membershipsBefore);
      expect(await db.deckVocabularyMembership.count({ where: { deckId: targetDeck.id, flashcardId: card.id } })).toBe(0);
      await expect(deckService.getDeckById(firstSharedDeck.id)).resolves.toMatchObject({ cards: [expect.objectContaining({ id: card.id, meaningVi: "nội dung dùng chung mới" })] });
      await expect(deckService.getDeckById(secondSharedDeck.id)).resolves.toMatchObject({ cards: [expect.objectContaining({ id: card.id, meaningVi: "nội dung dùng chung mới" })] });
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: term } });
      await db.deck.deleteMany({ where: { id: { in: [sourceDeck.id, firstSharedDeck.id, secondSharedDeck.id, targetDeck.id] } } });
    }
  });

  it("reviews and updates an unassigned canonical vocabulary record without creating a target membership", async () => {
    const targetDeck = await db.deck.create({ data: { name: "External V3 orphan target" } });
    const term = `external-v3-orphan-${crypto.randomUUID()}`;
    const rawJson = JSON.stringify({ schemaVersion: 1, cards: [{ term, meaningVi: "nghĩa mới orphan", partOfSpeech: "noun", ipa: null, definitionEn: "an updated orphan definition", exampleEn: "An orphan card remains global.", exampleVi: "Thẻ orphan vẫn là dữ liệu toàn cục.", cefr: null, imageUrl: null }] });

    try {
      const orphan = await db.flashcard.create({ data: { deckId: null, term, normalizedTerm: term, meaningVi: "nghĩa cũ orphan", partOfSpeech: "noun" } });
      const preview = await deckService.previewJsonFlashcardImport(targetDeck.id, rawJson, { mode: "external-ai-v3", manifest: { terms: [term] } });
      expect(preview.existingCards?.[0]).toMatchObject({ existingCard: { id: orphan.id, locations: [] }, reason: "Đã tồn tại trong WordNest nhưng hiện chưa thuộc bộ thẻ nào." });
      const saved = await deckService.importJsonFlashcards(targetDeck.id, rawJson, {
        mode: "external-ai-v3",
        manifest: { terms: [term] },
        review: { snapshots: preview.reviewSnapshots!, decisions: [{ flashcardId: orphan.id, action: "overwrite", confirmsPartOfSpeechChange: false }] },
      });
      expect(saved).toMatchObject({ cardsCreated: 0, existingUpdated: 1, linkedExistingCards: 0 });
      expect(await db.flashcard.findUniqueOrThrow({ where: { id: orphan.id } })).toMatchObject({ meaningVi: "nghĩa mới orphan" });
      expect(await db.deckVocabularyMembership.count({ where: { flashcardId: orphan.id } })).toBe(0);
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: term } });
      await db.deck.delete({ where: { id: targetDeck.id } }).catch(() => undefined);
    }
  });

  it("rejects a stale V3 review atomically rather than losing a concurrent canonical update", async () => {
    const sourceDeck = await db.deck.create({ data: { name: "External V3 stale source" } });
    const targetDeck = await db.deck.create({ data: { name: "External V3 stale target" } });
    const existingTerm = `external-v3-stale-existing-${crypto.randomUUID()}`;
    const newTerm = `external-v3-stale-new-${crypto.randomUUID()}`;
    const terms = [existingTerm, newTerm];
    const rawJson = JSON.stringify({ schemaVersion: 1, cards: terms.map((term) => ({ term, meaningVi: `AI ${term}`, partOfSpeech: "noun", ipa: null, definitionEn: `definition ${term}`, exampleEn: `Example ${term}.`, exampleVi: `Ví dụ ${term}.`, cefr: null, imageUrl: null })) });

    try {
      await deckService.createManualCards(sourceDeck.id, [{ term: existingTerm, meaningVi: "bản cũ", partOfSpeech: "noun" }]);
      const existing = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: existingTerm } });
      const preview = await deckService.previewJsonFlashcardImport(targetDeck.id, rawJson, { mode: "external-ai-v3", manifest: { terms } });
      await db.flashcard.update({ where: { id: existing.id }, data: { meaningVi: "được cập nhật đồng thời", updatedAt: new Date(Date.now() + 5_000) } });

      await expect(deckService.importJsonFlashcards(targetDeck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms }, review: { snapshots: preview.reviewSnapshots!, decisions: [{ flashcardId: existing.id, action: "overwrite", confirmsPartOfSpeechChange: false }] },
      })).rejects.toBeInstanceOf(StaleJsonFlashcardImportPreviewError);
      expect(await db.flashcard.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ meaningVi: "được cập nhật đồng thời" });
      expect(await db.flashcard.count({ where: { normalizedTerm: newTerm } })).toBe(0);
      expect(await db.deckVocabularyMembership.count({ where: { deckId: targetDeck.id } })).toBe(0);
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: { in: terms } } });
      await db.deck.delete({ where: { id: sourceDeck.id } }).catch(() => undefined);
      await db.deck.delete({ where: { id: targetDeck.id } }).catch(() => undefined);
    }
  });

  it("rejects an AI payload changed after preview even when global vocabulary did not change", async () => {
    const deck = await db.deck.create({ data: { name: "External V3 incoming stale target" } });
    const term = `external-v3-incoming-stale-${crypto.randomUUID()}`;
    const original = JSON.stringify({ schemaVersion: 1, cards: [{ term, meaningVi: "nghĩa đã xem", partOfSpeech: "noun", ipa: null, definitionEn: "the reviewed definition", exampleEn: "The reviewed example.", exampleVi: "Ví dụ đã xem.", cefr: null, imageUrl: null }] });
    const changed = JSON.stringify({ schemaVersion: 1, cards: [{ term, meaningVi: "nội dung bị đổi sau preview", partOfSpeech: "noun", ipa: null, definitionEn: "an unreviewed replacement", exampleEn: "An unreviewed example.", exampleVi: "Ví dụ chưa xem.", cefr: null, imageUrl: null }] });

    try {
      const preview = await deckService.previewJsonFlashcardImport(deck.id, original, { mode: "external-ai-v3", manifest: { terms: [term] } });
      await expect(deckService.importJsonFlashcards(deck.id, changed, {
        mode: "external-ai-v3", manifest: { terms: [term] }, review: { snapshots: preview.reviewSnapshots!, decisions: [] },
      })).rejects.toBeInstanceOf(StaleJsonFlashcardImportPreviewError);
      expect(await db.flashcard.count({ where: { normalizedTerm: term } })).toBe(0);
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: term } });
      await db.deck.delete({ where: { id: deck.id } }).catch(() => undefined);
    }
  });

  it("preserves nullable metadata and requires individual confirmation for a POS change", async () => {
    const sourceDeck = await db.deck.create({ data: { name: "External V3 nullable source" } });
    const targetDeck = await db.deck.create({ data: { name: "External V3 nullable target" } });
    const term = `external-v3-nullable-${crypto.randomUUID()}`;
    const rawJson = JSON.stringify({
      schemaVersion: 1,
      cards: [{ term, meaningVi: "nghĩa mới", partOfSpeech: "verb", ipa: null, definitionEn: "a new definition", exampleEn: "A new example.", exampleVi: "Một ví dụ mới.", cefr: null, imageUrl: null }],
    });

    try {
      await deckService.createManualCards(sourceDeck.id, [{ term, meaningVi: "nghĩa cũ", partOfSpeech: "noun", ipa: "/kəˈnɛkt/", cefr: "B2" }]);
      const existing = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: term } });
      await db.flashcard.update({ where: { id: existing.id }, data: { imageUrl: "https://example.com/keep.jpg" } });
      const preview = await deckService.previewJsonFlashcardImport(targetDeck.id, rawJson, { mode: "external-ai-v3", manifest: { terms: [term] } });
      const duplicate = preview.existingCards?.[0];
      expect(duplicate).toMatchObject({ requiresIndividualOverwriteConfirmation: true, effectiveIncomingCard: { ipa: "/kəˈnɛkt/", cefr: "B2", imageUrl: "https://example.com/keep.jpg" } });

      await expect(deckService.importJsonFlashcards(targetDeck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms: [term] }, review: { snapshots: preview.reviewSnapshots!, decisions: [{ flashcardId: existing.id, action: "overwrite", confirmsPartOfSpeechChange: false }] },
      })).rejects.toBeInstanceOf(JsonFlashcardImportError);
      const saved = await deckService.importJsonFlashcards(targetDeck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms: [term] }, review: { snapshots: preview.reviewSnapshots!, decisions: [{ flashcardId: existing.id, action: "overwrite", confirmsPartOfSpeechChange: true }] },
      });
      expect(saved).toMatchObject({ cardsCreated: 0, existingUpdated: 1, linkedExistingCards: 0 });
      expect(await db.flashcard.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ id: existing.id, meaningVi: "nghĩa mới", partOfSpeech: "verb", ipa: "/kəˈnɛkt/", cefr: "B2", imageUrl: "https://example.com/keep.jpg" });
      expect(await db.deckVocabularyMembership.count({ where: { deckId: targetDeck.id } })).toBe(0);
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: term } });
      await db.deck.delete({ where: { id: sourceDeck.id } }).catch(() => undefined);
      await db.deck.delete({ where: { id: targetDeck.id } }).catch(() => undefined);
    }
  });

  it("surfaces historical ambiguity without selecting, overwriting, or linking a canonical card", async () => {
    const sourceDeck = await db.deck.create({ data: { name: "External V3 ambiguous source" } });
    const targetDeck = await db.deck.create({ data: { name: "External V3 ambiguous target" } });
    const term = `external-v3-ambiguous-${crypto.randomUUID()}`;
    const rawJson = JSON.stringify({ schemaVersion: 1, cards: [{ term, meaningVi: "nghĩa AI", partOfSpeech: "noun", ipa: null, definitionEn: "an AI definition", exampleEn: "An AI example.", exampleVi: "Một ví dụ AI.", cefr: null, imageUrl: null }] });

    try {
      await deckService.createManualCards(sourceDeck.id, [{ term, meaningVi: "nghĩa lịch sử", partOfSpeech: "noun" }]);
      const existing = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: term } });
      await db.vocabularyIdentity.update({ where: { normalizedTerm: term }, data: { canonicalFlashcardId: null, hasHistoricalDuplicates: true, historicalDuplicateCount: 2 } });
      const preview = await deckService.previewJsonFlashcardImport(targetDeck.id, rawJson, { mode: "external-ai-v3", manifest: { terms: [term] } });
      expect(preview.existingCards?.[0]).toMatchObject({ status: "AMBIGUOUS_LEGACY_IDENTITY", existingCardId: undefined, existingCandidates: [expect.objectContaining({ id: existing.id })] });
      const saved = await deckService.importJsonFlashcards(targetDeck.id, rawJson, {
        mode: "external-ai-v3", manifest: { terms: [term] }, review: { snapshots: preview.reviewSnapshots!, decisions: [] },
      });
      expect(saved).toMatchObject({ cardsCreated: 0, existingUpdated: 0, ambiguousSkipped: 1, linkedExistingCards: 0 });
      expect(await db.flashcard.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ meaningVi: "nghĩa lịch sử" });
      expect(await db.deckVocabularyMembership.count({ where: { deckId: targetDeck.id } })).toBe(0);
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: term } });
      await db.deck.delete({ where: { id: sourceDeck.id } }).catch(() => undefined);
      await db.deck.delete({ where: { id: targetDeck.id } }).catch(() => undefined);
    }
  });

  it("previews a manual duplicate and overwrites lexical content without changing its learning history or memberships", async () => {
    const sourceDeck = await db.deck.create({ data: { name: "Study manual duplicate source" } });
    const sharedDeck = await db.deck.create({ data: { name: "Study manual duplicate shared" } });
    const targetDeck = await db.deck.create({ data: { name: "Study manual duplicate target" } });
    const term = `study-manual-duplicate-${crypto.randomUUID()}`;

    try {
      await deckService.createManualCards(sourceDeck.id, [{
        term,
        meaningVi: "nghĩa cũ",
        partOfSpeech: "noun",
        ipa: "/ˈɔːld/",
        definitionEn: "an older definition",
        exampleEn: "This is the old example.",
        exampleVi: "Đây là ví dụ cũ.",
        cefr: "B2",
      }]);
      const existing = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: term } });
      await deckService.linkExistingVocabularyToDeck(sharedDeck.id, existing.id);
      await db.reviewLog.create({
        data: {
          cardId: existing.id,
          rating: 3,
          state: 1,
          due: new Date(),
          stability: 4.2,
          difficulty: 5.1,
          elapsedDays: 2,
          lastElapsedDays: 1,
          scheduledDays: 5,
          reviewEventId: crypto.randomUUID(),
        },
      });
      await db.practiceAttempt.create({
        data: {
          flashcardId: existing.id,
          sessionId: crypto.randomUUID(),
          mode: "flashcard",
          questionType: "recognition",
          correct: true,
          answer: term,
          expectedAnswer: term,
        },
      });

      const membershipsBefore = await db.deckVocabularyMembership.findMany({
        where: { flashcardId: existing.id },
        orderBy: { id: "asc" },
      });
      const reviewLogsBefore = await db.reviewLog.findMany({ where: { cardId: existing.id } });
      const attemptsBefore = await db.practiceAttempt.findMany({ where: { flashcardId: existing.id } });
      const schedulerBefore = await db.flashcard.findUniqueOrThrow({ where: { id: existing.id } });
      const incoming = {
        term,
        meaningVi: "nghĩa được viết lại khi ôn",
        definitionEn: "a revised definition written while studying",
        exampleEn: "The learner added this example while reviewing.",
      };

      const preview = await deckService.previewManualFlashcardDuplicate(targetDeck.id, incoming);
      expect(preview).toMatchObject({
        classification: "existing",
        existingCard: { id: existing.id, meaningVi: "nghĩa cũ" },
        changedFields: ["meaningVi", "definitionEn", "exampleEn"],
      });

      const saved = await deckService.commitManualFlashcardFromStudy(targetDeck.id, incoming, {
        action: "overwrite",
        existingCardId: preview.existingCard!.id,
        contentVersion: preview.existingCard!.contentVersion,
        incomingFingerprint: preview.incomingFingerprint,
      });

      expect(saved).toMatchObject({ action: "overwritten", card: { id: existing.id, meaningVi: incoming.meaningVi } });
      const updated = await db.flashcard.findUniqueOrThrow({ where: { id: existing.id } });
      expect(updated).toMatchObject({
        id: existing.id,
        term,
        meaningVi: incoming.meaningVi,
        definitionEn: incoming.definitionEn,
        exampleEn: incoming.exampleEn,
        partOfSpeech: "noun",
        ipa: "/ˈɔːld/",
        cefr: "B2",
      });
      for (const field of ["due", "state", "status", "stability", "difficulty", "elapsedDays", "scheduledDays", "learningSteps", "reps", "lapses", "lastReviewAt", "schedulerVersion"] as const) {
        expect(updated[field]).toEqual(schedulerBefore[field]);
      }
      expect(await db.reviewLog.findMany({ where: { cardId: existing.id } })).toEqual(reviewLogsBefore);
      expect(await db.practiceAttempt.findMany({ where: { flashcardId: existing.id } })).toEqual(attemptsBefore);
      expect(await db.deckVocabularyMembership.findMany({ where: { flashcardId: existing.id }, orderBy: { id: "asc" } })).toEqual(membershipsBefore);
      expect(await db.deckVocabularyMembership.count({ where: { deckId: targetDeck.id, flashcardId: existing.id } })).toBe(0);
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: term } });
      await db.deck.deleteMany({ where: { id: { in: [sourceDeck.id, sharedDeck.id, targetDeck.id] } } });
    }
  });

  it("creates a new manual study card only after its new-identity preview is confirmed", async () => {
    const deck = await db.deck.create({ data: { name: "Study manual create target" } });
    const term = `study-manual-create-${crypto.randomUUID()}`;
    const incoming = { term, meaningVi: "được thêm từ phiên ôn", partOfSpeech: "verb" as const };

    try {
      const preview = await deckService.previewManualFlashcardDuplicate(deck.id, incoming);
      expect(preview).toMatchObject({ classification: "new", changedFields: [] });

      const saved = await deckService.commitManualFlashcardFromStudy(deck.id, incoming, {
        action: "create",
        incomingFingerprint: preview.incomingFingerprint,
      });

      expect(saved).toEqual({ action: "created" });
      const created = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: term } });
      expect(created).toMatchObject({ term, meaningVi: incoming.meaningVi, partOfSpeech: "verb", state: 0 });
      await expect(db.deckVocabularyMembership.count({ where: { deckId: deck.id, flashcardId: created.id } })).resolves.toBe(1);
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: term } });
      await db.deck.delete({ where: { id: deck.id } }).catch(() => undefined);
    }
  });

  it("rejects a manual overwrite when the reviewed card changes before confirmation", async () => {
    const sourceDeck = await db.deck.create({ data: { name: "Study manual stale source" } });
    const targetDeck = await db.deck.create({ data: { name: "Study manual stale target" } });
    const term = `study-manual-stale-${crypto.randomUUID()}`;

    try {
      await deckService.createManualCards(sourceDeck.id, [{ term, meaningVi: "nghĩa trước khi xem" }]);
      const existing = await db.flashcard.findFirstOrThrow({ where: { normalizedTerm: term } });
      const incoming = { term, meaningVi: "nghĩa đang định ghi đè" };
      const preview = await deckService.previewManualFlashcardDuplicate(targetDeck.id, incoming);
      await db.flashcard.update({
        where: { id: existing.id },
        data: { meaningVi: "đã có người cập nhật", updatedAt: new Date(Date.now() + 5_000) },
      });

      await expect(deckService.commitManualFlashcardFromStudy(targetDeck.id, incoming, {
        action: "overwrite",
        existingCardId: preview.existingCard!.id,
        contentVersion: preview.existingCard!.contentVersion,
        incomingFingerprint: preview.incomingFingerprint,
      })).rejects.toBeInstanceOf(StaleManualFlashcardDuplicatePreviewError);
      expect(await db.flashcard.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ meaningVi: "đã có người cập nhật" });
    } finally {
      await db.flashcard.deleteMany({ where: { normalizedTerm: term } });
      await db.deck.deleteMany({ where: { id: { in: [sourceDeck.id, targetDeck.id] } } });
    }
  });

});
