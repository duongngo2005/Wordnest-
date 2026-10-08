import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { quizService, practiceEvidenceService } from "@/services/vocabulary";

describe("Mistake Bank Targeted Practice Contract (Phase 1A)", () => {
  let deckId: string;
  let otherDeckId: string;
  let cardAId: string;
  let cardBId: string;
  let cardCId: string;
  let otherDeckCardId: string;

  beforeEach(async () => {
    // 1. Create primary deck
    const deck = await db.deck.create({
      data: { name: `TargetedTestDeck-${crypto.randomUUID()}` },
    });
    deckId = deck.id;

    // 2. Create other deck for cross-deck leakage test
    const otherDeck = await db.deck.create({
      data: { name: `OtherDeck-${crypto.randomUUID()}` },
    });
    otherDeckId = otherDeck.id;

    // Card A: NEEDS_PRACTICE (2 failures)
    const cardA = await db.flashcard.create({
      data: {
        deckId,
        term: "allocate",
        normalizedTerm: "allocate",
        meaningVi: "phân bổ",
      },
    });
    cardAId = cardA.id;
    for (let i = 1; i <= 2; i++) {
      await db.practiceAttempt.create({
        data: {
          flashcardId: cardA.id,
          sessionId: `ses-a-${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "wrong",
          expectedAnswer: "allocate",
          createdAt: new Date(`2026-01-0${i}T10:00:00Z`),
        },
      });
    }

    // Card B: NEEDS_PRACTICE (2 failures)
    const cardB = await db.flashcard.create({
      data: {
        deckId,
        term: "resilient",
        normalizedTerm: "resilient",
        meaningVi: "kiên cường",
      },
    });
    cardBId = cardB.id;
    for (let i = 1; i <= 2; i++) {
      await db.practiceAttempt.create({
        data: {
          flashcardId: cardB.id,
          sessionId: `ses-b-${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "wrong",
          expectedAnswer: "resilient",
          createdAt: new Date(`2026-01-0${i}T10:00:00Z`),
        },
      });
    }

    // Card C: INSUFFICIENT_DATA (failed exactly once)
    const cardC = await db.flashcard.create({
      data: {
        deckId,
        term: "meticulous",
        normalizedTerm: "meticulous",
        meaningVi: "tỉ mỉ",
      },
    });
    cardCId = cardC.id;
    await db.practiceAttempt.create({
      data: {
        flashcardId: cardC.id,
        sessionId: "ses-c-1",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong",
        expectedAnswer: "meticulous",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
    });

    // Other Deck Card
    const otherCard = await db.flashcard.create({
      data: {
        deckId: otherDeckId,
        term: "forbidden",
        normalizedTerm: "forbidden",
        meaningVi: "bị cấm",
      },
    });
    otherDeckCardId = otherCard.id;
  });

  afterEach(async () => {
    if (deckId) {
      await db.deck.delete({ where: { id: deckId } }).catch(() => {});
    }
    if (otherDeckId) {
      await db.deck.delete({ where: { id: otherDeckId } }).catch(() => {});
    }
  });

  it("CASE 1: Selecting INSUFFICIENT_DATA mistake [C] must include C, and must NOT replace it with A/B", async () => {
    // Verify initial classifications
    const deckEvidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    expect(deckEvidence.summaries.get(cardAId)?.classification).toBe("NEEDS_PRACTICE");
    expect(deckEvidence.summaries.get(cardBId)?.classification).toBe("NEEDS_PRACTICE");
    expect(deckEvidence.summaries.get(cardCId)?.classification).toBe("INSUFFICIENT_DATA");

    // Mistake Bank targets C
    const quizSession = await quizService.getFocusedPracticeQuiz(deckId, 10, [cardCId]);

    expect(quizSession.questions).toHaveLength(1);
    expect(quizSession.questions[0].cardId).toBe(cardCId);
    expect(quizSession.questions[0].prompt).toBe("tỉ mỉ");
    expect(quizSession.questions[0].type).toBe("typed_vi_en");

    // Verify server-side session stores the exact correct answer securely
    const storedSession = await db.quizSession.findUniqueOrThrow({
      where: { id: quizSession.sessionId },
    });
    expect(storedSession.questions).toMatchObject([{ correctAnswer: "meticulous" }]);

    // A and B must NOT be included or replace C
    const questionCardIds = quizSession.questions.map((q) => q.cardId);
    expect(questionCardIds).not.toContain(cardAId);
    expect(questionCardIds).not.toContain(cardBId);
  });

  it("CASE 2: Selecting [B, C] yields a session containing strictly B and C", async () => {
    const quizSession = await quizService.getFocusedPracticeQuiz(deckId, 10, [cardBId, cardCId]);

    expect(quizSession.questions).toHaveLength(2);
    const questionCardIds = quizSession.questions.map((q) => q.cardId);
    expect(questionCardIds).toContain(cardBId);
    expect(questionCardIds).toContain(cardCId);
    expect(questionCardIds).not.toContain(cardAId);
  });

  it("CASE 3: CardId belonging to another deck is ignored (no cross-deck leakage)", async () => {
    const quizSession = await quizService.getFocusedPracticeQuiz(deckId, 10, [otherDeckCardId, cardCId]);

    // otherDeckCardId belongs to otherDeckId, so it must be filtered out
    expect(quizSession.questions).toHaveLength(1);
    expect(quizSession.questions[0].cardId).toBe(cardCId);

    // If only otherDeckCardId is passed, session must be empty
    const crossDeckOnly = await quizService.getFocusedPracticeQuiz(deckId, 10, [otherDeckCardId]);
    expect(crossDeckOnly.questions).toHaveLength(0);
    expect(crossDeckOnly.totalEligible).toBe(0);
  });

  it("CASE 4: Duplicate cardIds are deduplicated (one question per card)", async () => {
    const quizSession = await quizService.getFocusedPracticeQuiz(deckId, 10, [cardBId, cardBId, cardBId]);

    expect(quizSession.questions).toHaveLength(1);
    expect(quizSession.questions[0].cardId).toBe(cardBId);
  });

  it("CASE 5: Unspecified targetCardIds (undefined) retains legacy Focused Practice behavior", async () => {
    // Legacy behavior: picks top weak cards (NEEDS_PRACTICE / MIXED only, excludes INSUFFICIENT_DATA)
    const quizSession = await quizService.getFocusedPracticeQuiz(deckId, 10, undefined);

    expect(quizSession.questions).toHaveLength(2);
    const questionCardIds = quizSession.questions.map((q) => q.cardId);
    expect(questionCardIds).toContain(cardAId);
    expect(questionCardIds).toContain(cardBId);
    expect(questionCardIds).not.toContain(cardCId); // C is INSUFFICIENT_DATA so excluded in legacy mode
  });

  it("CASE 6: Explicit empty cardIds ([]) returns an empty session (no silent ambiguity)", async () => {
    const quizSession = await quizService.getFocusedPracticeQuiz(deckId, 10, []);

    expect(quizSession.questions).toHaveLength(0);
    expect(quizSession.totalEligible).toBe(0);
    expect(quizSession.sessionId).toBe("");
  });
});
