import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  aggregateCardPracticeEvidence,
  practiceEvidenceService,
  selectPracticeMode,
  getNeedPracticePriority,
  EVIDENCE_CONFIG,
} from "./practice-evidence-service";
import { PracticeAttempt } from "@prisma/client";

describe("PracticeEvidenceService", () => {
  let deckId: string;
  let cardId: string;

  beforeEach(async () => {
    const deck = await db.deck.create({
      data: { name: `Practice Evidence Test ${crypto.randomUUID()}` },
    });
    deckId = deck.id;

    const card = await db.flashcard.create({
      data: {
        deckId,
        term: "allocate",
        normalizedTerm: "allocate",
        meaningVi: "phân bổ",
      },
    });
    cardId = card.id;
  });

  afterEach(async () => {
    if (deckId) {
      await db.deck.delete({ where: { id: deckId } }).catch(() => {});
    }
  });

  // Helper to create in-memory PracticeAttempt object
  function makeAttempt(partial: Partial<PracticeAttempt> = {}): PracticeAttempt {
    return {
      id: crypto.randomUUID(),
      flashcardId: cardId,
      sessionId: "session-1",
      questionId: "q-1",
      prompt: "phân bổ",
      attemptNumber: 1,
      mode: "quiz",
      questionType: "typed_vi_en",
      correct: true,
      answer: "allocate",
      expectedAnswer: "allocate",
      responseMs: 1500,
      createdAt: new Date(),
      ...partial,
    };
  }

  describe("Aggregation Core Logic (Pure)", () => {
    it("1. returns NO_EVIDENCE when card has no attempts", () => {
      const summary = aggregateCardPracticeEvidence(cardId, []);
      expect(summary.classification).toBe("NO_EVIDENCE");
      expect(summary.firstPassAttempts).toBe(0);
      expect(summary.firstPassCorrect).toBe(0);
      expect(summary.firstPassIncorrect).toBe(0);
      expect(summary.retryAttempts).toBe(0);
      expect(summary.latestFirstPassCorrect).toBeNull();
      expect(summary.lastPracticedAt).toBeNull();
    });

    it("2. counts first-pass correct attempts correctly", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: true, createdAt: new Date("2026-01-01") }),
        makeAttempt({ attemptNumber: 1, correct: true, createdAt: new Date("2026-01-02") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.firstPassAttempts).toBe(2);
      expect(summary.firstPassCorrect).toBe(2);
      expect(summary.firstPassIncorrect).toBe(0);
      expect(summary.latestFirstPassCorrect).toBe(true);
    });

    it("3. counts first-pass incorrect attempts correctly", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01") }),
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-02") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.firstPassAttempts).toBe(2);
      expect(summary.firstPassCorrect).toBe(0);
      expect(summary.firstPassIncorrect).toBe(2);
      expect(summary.latestFirstPassCorrect).toBe(false);
    });

    it("4. separates retry correct (correctedOnRetry) from first-pass", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01T10:00:00Z") }),
        makeAttempt({ attemptNumber: 2, correct: true, createdAt: new Date("2026-01-01T10:02:00Z") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.firstPassAttempts).toBe(1);
      expect(summary.firstPassCorrect).toBe(0);
      expect(summary.firstPassIncorrect).toBe(1);
      expect(summary.retryAttempts).toBe(1);
      expect(summary.retryCorrect).toBe(1);
      expect(summary.retryIncorrect).toBe(0);
    });

    it("5. separates retry incorrect (stillIncorrectOnRetry)", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01T10:00:00Z") }),
        makeAttempt({ attemptNumber: 2, correct: false, createdAt: new Date("2026-01-01T10:02:00Z") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.firstPassAttempts).toBe(1);
      expect(summary.firstPassIncorrect).toBe(1);
      expect(summary.retryAttempts).toBe(1);
      expect(summary.retryCorrect).toBe(0);
      expect(summary.retryIncorrect).toBe(1);
    });

    it("6. verifies retries never modify first-pass accuracy or counts", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01T10:00:00Z") }),
        makeAttempt({ attemptNumber: 2, correct: true, createdAt: new Date("2026-01-01T10:02:00Z") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      // Even though retry was correct, first-pass remains strictly 0 correct, 1 incorrect
      expect(summary.firstPassAttempts).toBe(1);
      expect(summary.firstPassCorrect).toBe(0);
      expect(summary.firstPassIncorrect).toBe(1);
    });

    it("7. tracks latest first-pass result chronologically", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01") }),
        makeAttempt({ attemptNumber: 1, correct: true, createdAt: new Date("2026-01-03") }),
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-02") }), // out of order input
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      // Chronologically, 2026-01-03 was true
      expect(summary.latestFirstPassCorrect).toBe(true);
    });

    it("8. captures lastPracticedAt correctly", () => {
      const latestDate = new Date("2026-05-20T12:00:00Z");
      const attempts = [
        makeAttempt({ attemptNumber: 1, createdAt: new Date("2026-05-19T10:00:00Z") }),
        makeAttempt({ attemptNumber: 2, createdAt: latestDate }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.lastPracticedAt).toEqual(latestDate);
    });
  });

  describe("Question-Type Separation", () => {
    it("9. aggregates typed_vi_en separately", () => {
      const attempts = [
        makeAttempt({ questionType: "typed_vi_en", correct: true }),
        makeAttempt({ questionType: "typed_vi_en", correct: false }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.breakdownByQuestionType.typedRecall).toEqual({
        attempts: 2,
        correct: 1,
        incorrect: 1,
      });
      expect(summary.breakdownByQuestionType.storyCloze.attempts).toBe(0);
      expect(summary.breakdownByQuestionType.multipleChoice.attempts).toBe(0);
    });

    it("10. aggregates story_cloze separately", () => {
      const attempts = [
        makeAttempt({ questionType: "story_cloze", correct: false }),
        makeAttempt({ questionType: "story_cloze", correct: true }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.breakdownByQuestionType.storyCloze).toEqual({
        attempts: 2,
        correct: 1,
        incorrect: 1,
      });
      expect(summary.breakdownByQuestionType.typedRecall.attempts).toBe(0);
      expect(summary.breakdownByQuestionType.multipleChoice.attempts).toBe(0);
    });

    it("11. aggregates multiple choice modes under multipleChoice", () => {
      const attempts = [
        makeAttempt({ questionType: "multiple_choice_en_vi", correct: true }),
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: true }),
        makeAttempt({ questionType: "fill_in_blank", correct: false }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.breakdownByQuestionType.multipleChoice).toEqual({
        attempts: 3,
        correct: 2,
        incorrect: 1,
      });
    });

    it("12. preserves distinction between recognition (MC) and typed recall", () => {
      // 5 MC correct, 2 typed wrong
      const attempts = [
        makeAttempt({ questionType: "multiple_choice_en_vi", correct: true }),
        makeAttempt({ questionType: "multiple_choice_en_vi", correct: true }),
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: true }),
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: true }),
        makeAttempt({ questionType: "multiple_choice_en_vi", correct: true }),
        makeAttempt({ questionType: "typed_vi_en", correct: false }),
        makeAttempt({ questionType: "typed_vi_en", correct: false }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.breakdownByQuestionType.multipleChoice.correct).toBe(5);
      expect(summary.breakdownByQuestionType.multipleChoice.incorrect).toBe(0);
      expect(summary.breakdownByQuestionType.typedRecall.correct).toBe(0);
      expect(summary.breakdownByQuestionType.typedRecall.incorrect).toBe(2);

      // Must not collapse into a single misleading 5/7 (71%) overall accuracy
      expect(summary.breakdownByQuestionType.multipleChoice.attempts).toBe(5);
      expect(summary.breakdownByQuestionType.typedRecall.attempts).toBe(2);
    });
  });

  describe("Recent Window vs Lifetime Evidence", () => {
    it("13. excludes older attempts from recent window while keeping lifetime counts accurate", () => {
      // Create 8 attempts: 3 old failures, then 5 recent successes
      const attempts: PracticeAttempt[] = [];
      for (let i = 1; i <= 3; i++) {
        attempts.push(
          makeAttempt({
            attemptNumber: 1,
            correct: false,
            createdAt: new Date(`2026-01-0${i}`),
          })
        );
      }
      for (let i = 4; i <= 8; i++) {
        attempts.push(
          makeAttempt({
            attemptNumber: 1,
            correct: true,
            createdAt: new Date(`2026-01-0${i}`),
          })
        );
      }

      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      // Lifetime
      expect(summary.firstPassAttempts).toBe(8);
      expect(summary.firstPassCorrect).toBe(5);
      expect(summary.firstPassIncorrect).toBe(3);

      // Recent window of N = 5
      expect(summary.recentFirstPassAttempts).toHaveLength(EVIDENCE_CONFIG.RECENT_WINDOW_SIZE);
      expect(summary.recentFirstPassAttempts.every((a) => a.correct)).toBe(true);

      // Ancient failures do not dominate recent classification
      expect(summary.classification).toBe("RECENTLY_SUCCESSFUL");
    });
  });

  describe("Classification Rules & Insufficient Data", () => {
    it("14. marks cards with only 1 attempt as INSUFFICIENT_DATA (not permanently weak)", () => {
      const attempts = [makeAttempt({ attemptNumber: 1, correct: false })];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.classification).toBe("INSUFFICIENT_DATA");
    });

    it("15. classifies card as NEEDS_PRACTICE when recent failure is clear", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: true, createdAt: new Date("2026-01-01") }),
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-02") }),
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-03") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.classification).toBe("NEEDS_PRACTICE");
    });

    it("16. classifies card as MIXED when recent performance is unstable", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: true, createdAt: new Date("2026-01-01") }),
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-02") }),
        makeAttempt({ attemptNumber: 1, correct: true, createdAt: new Date("2026-01-03") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.classification).toBe("MIXED");
    });

    it("17. confirms retry-correct alone does NOT promote card to RECENTLY_SUCCESSFUL", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01T10:00:00Z") }),
        makeAttempt({ attemptNumber: 2, correct: true, createdAt: new Date("2026-01-01T10:02:00Z") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.classification).not.toBe("RECENTLY_SUCCESSFUL");
    });
  });

  describe("Response Time Isolation", () => {
    it("18. does not classify card as weak based purely on large responseMs", () => {
      // 3 correct attempts with high response latency (e.g. 15 seconds)
      const attempts = [
        makeAttempt({ attemptNumber: 1, correct: true, responseMs: 15000, createdAt: new Date("2026-01-01") }),
        makeAttempt({ attemptNumber: 1, correct: true, responseMs: 25000, createdAt: new Date("2026-01-02") }),
        makeAttempt({ attemptNumber: 1, correct: true, responseMs: 30000, createdAt: new Date("2026-01-03") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      // High latency alone MUST NOT degrade classification to NEEDS_PRACTICE
      expect(summary.classification).toBe("RECENTLY_SUCCESSFUL");
    });
  });

  describe("Malformed Data Resilience", () => {
    it("19. handles orphan retry records without crashing or counting as first pass", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 2, correct: true, createdAt: new Date("2026-01-01") }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.firstPassAttempts).toBe(0);
      expect(summary.retryAttempts).toBe(1);
      expect(summary.classification).toBe("NO_EVIDENCE");
    });
  });

  describe("FSRS Isolation & Database Queries", () => {
    it("20. performs ZERO writes to Flashcard scheduler or ReviewLog when reading evidence", async () => {
      // Insert raw practice attempts into database (2 first-pass attempts so it qualifies as NEEDS_PRACTICE)
      await db.practiceAttempt.createMany({
        data: [
          {
            flashcardId: cardId,
            sessionId: "ses-0",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: false,
            answer: "alloc",
            expectedAnswer: "allocate",
            responseMs: 1500,
            createdAt: new Date("2026-01-01T10:00:00Z"),
          },
          {
            flashcardId: cardId,
            sessionId: "ses-test",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: false,
            answer: "allocat",
            expectedAnswer: "allocate",
            responseMs: 1200,
            createdAt: new Date("2026-01-01T10:01:00Z"),
          },
          {
            flashcardId: cardId,
            sessionId: "ses-test",
            attemptNumber: 2,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: true,
            answer: "allocate",
            expectedAnswer: "allocate",
            responseMs: 1000,
            createdAt: new Date("2026-01-01T10:02:00Z"),
          },
        ],
      });

      const schedulerBefore = await db.flashcard.findUniqueOrThrow({
        where: { id: cardId },
      });
      const reviewLogsCountBefore = await db.reviewLog.count({ where: { cardId } });

      // Run service queries
      const cardSummary = await practiceEvidenceService.getFlashcardEvidenceSummary(cardId);
      const deckEvidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);

      expect(cardSummary.firstPassAttempts).toBe(2);
      expect(cardSummary.retryAttempts).toBe(1);
      expect(deckEvidence.needPracticeCards).toHaveLength(1);

      // Verify FSRS scheduler remains 100% untouched
      const schedulerAfter = await db.flashcard.findUniqueOrThrow({
        where: { id: cardId },
      });
      expect(schedulerAfter).toEqual(schedulerBefore);

      // Verify ReviewLog count is 0
      const reviewLogsCountAfter = await db.reviewLog.count({ where: { cardId } });
      expect(reviewLogsCountAfter).toBe(reviewLogsCountBefore);
      expect(reviewLogsCountAfter).toBe(0);
    });

    it("21. batches deck evidence queries and deterministically sorts needPracticeCards", async () => {
      // Create second card
      const card2 = await db.flashcard.create({
        data: {
          deckId,
          term: "resilient",
          normalizedTerm: "resilient",
          meaningVi: "kiên cường",
        },
      });

      // Card 1: 2 first pass attempts (both failed) + failed retry (Tier 400 - highest priority)
      await db.practiceAttempt.createMany({
        data: [
          {
            flashcardId: cardId,
            sessionId: "ses-0",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: false,
            answer: "wrong0",
            expectedAnswer: "allocate",
            createdAt: new Date("2026-01-01T10:00:00Z"),
          },
          {
            flashcardId: cardId,
            sessionId: "ses-1",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: false,
            answer: "wrong",
            expectedAnswer: "allocate",
            createdAt: new Date("2026-01-01T10:01:00Z"),
          },
          {
            flashcardId: cardId,
            sessionId: "ses-1",
            attemptNumber: 2,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: false,
            answer: "still wrong",
            expectedAnswer: "allocate",
            createdAt: new Date("2026-01-01T10:02:00Z"),
          },
        ],
      });

      // Card 2: 2 first pass attempts (first correct, second failed) + corrected on retry (Tier 300 - second priority)
      await db.practiceAttempt.createMany({
        data: [
          {
            flashcardId: card2.id,
            sessionId: "ses-0",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: true,
            answer: "resilient",
            expectedAnswer: "resilient",
            createdAt: new Date("2026-01-01T10:00:00Z"),
          },
          {
            flashcardId: card2.id,
            sessionId: "ses-2",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: false,
            answer: "wrong",
            expectedAnswer: "resilient",
            createdAt: new Date("2026-01-01T10:01:00Z"),
          },
          {
            flashcardId: card2.id,
            sessionId: "ses-2",
            attemptNumber: 2,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: true,
            answer: "resilient",
            expectedAnswer: "resilient",
            createdAt: new Date("2026-01-01T10:02:00Z"),
          },
        ],
      });

      const deckResult = await practiceEvidenceService.getDeckPracticeEvidence(deckId);

      expect(deckResult.needPracticeCards).toHaveLength(2);
      // Card 1 (failed both passes) must be ordered before Card 2 (corrected on retry)
      expect(deckResult.needPracticeCards[0].card.id).toBe(cardId);
      expect(deckResult.needPracticeCards[1].card.id).toBe(card2.id);
      expect(deckResult.needPracticeCards[0].priorityScore).toBeGreaterThan(
        deckResult.needPracticeCards[1].priorityScore
      );
    });
  });

  describe("Phase 3A.1 Semantics (Neutral Insufficient Data & No Evidence)", () => {
    it("22. strictly excludes NO_EVIDENCE and INSUFFICIENT_DATA from needPracticeCards", async () => {
      // Create card with 0 attempts (NO_EVIDENCE)
      const noEvidenceCard = await db.flashcard.create({
        data: { deckId, term: "ephemeral", normalizedTerm: "ephemeral", meaningVi: "phù du" },
      });

      // Create card with 1 attempt only (INSUFFICIENT_DATA - failed)
      const insufficientCard = await db.flashcard.create({
        data: { deckId, term: "meticulous", normalizedTerm: "meticulous", meaningVi: "tỉ mỉ" },
      });
      await db.practiceAttempt.create({
        data: {
          flashcardId: insufficientCard.id,
          sessionId: "ses-single",
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "metic",
          expectedAnswer: "meticulous",
        },
      });

      // Check classifications directly
      const noEvSummary = await practiceEvidenceService.getFlashcardEvidenceSummary(noEvidenceCard.id);
      expect(noEvSummary.classification).toBe("NO_EVIDENCE");
      expect(getNeedPracticePriority(noEvSummary)).toBe(0);

      const insuffSummary = await practiceEvidenceService.getFlashcardEvidenceSummary(insufficientCard.id);
      expect(insuffSummary.classification).toBe("INSUFFICIENT_DATA");
      expect(getNeedPracticePriority(insuffSummary)).toBe(0);

      // Verify neither card appears in needPracticeCards
      const deckResult = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const needPracticeCardIds = deckResult.needPracticeCards.map((item) => item.card.id);
      expect(needPracticeCardIds).not.toContain(noEvidenceCard.id);
      expect(needPracticeCardIds).not.toContain(insufficientCard.id);
    });
  });

  describe("Targeted Practice Mode Selection (selectPracticeMode)", () => {
    it("23. selects appropriate practice mode based on failure breakdown", () => {
      const baseCard = { term: "allocate", meaningVi: "phân bổ", exampleEn: "They allocate funds." };

      // Case A: Active recall (typed) failure -> selects typed_vi_en
      const typedFailSummary = aggregateCardPracticeEvidence(cardId, [
        makeAttempt({ attemptNumber: 1, questionType: "typed_vi_en", correct: false }),
        makeAttempt({ attemptNumber: 1, questionType: "typed_vi_en", correct: false }),
      ]);
      const selA = selectPracticeMode(baseCard, typedFailSummary, { hasStoryContext: true });
      expect(selA.targetQuestionType).toBe("typed_vi_en");
      expect(selA.selectionReason).toContain("Gõ từ");

      // Case B: Historical Story Cloze failure is reinforced with the active typed mode.
      const storyFailSummary = aggregateCardPracticeEvidence(cardId, [
        makeAttempt({ attemptNumber: 1, questionType: "story_cloze", correct: false }),
        makeAttempt({ attemptNumber: 1, questionType: "story_cloze", correct: false }),
      ]);
      const selB = selectPracticeMode(baseCard, storyFailSummary, { hasStoryContext: true });
      expect(selB.targetQuestionType).toBe("typed_vi_en");
      expect(selB.selectionReason).toContain("điền từ trong truyện");

      // Case C: Story availability cannot reactivate parked Story Cloze.
      const selC = selectPracticeMode(baseCard, storyFailSummary, { hasStoryContext: false });
      expect(selC.targetQuestionType).toBe("typed_vi_en");
      expect(selC.selectionReason).toContain("điền từ trong truyện");

      // Case D: Multiple choice failure with exampleEn -> selects fill_in_blank
      const mcFailSummary = aggregateCardPracticeEvidence(cardId, [
        makeAttempt({ attemptNumber: 1, questionType: "multiple_choice_vi_en", correct: false }),
        makeAttempt({ attemptNumber: 1, questionType: "multiple_choice_vi_en", correct: false }),
      ]);
      const selD = selectPracticeMode(baseCard, mcFailSummary, { hasStoryContext: false });
      expect(selD.targetQuestionType).toBe("fill_in_blank");

      // Case E: Multiple choice failure without exampleEn -> selects multiple_choice_vi_en
      const selE = selectPracticeMode({ ...baseCard, exampleEn: null }, mcFailSummary, { hasStoryContext: false });
      expect(selE.targetQuestionType).toBe("multiple_choice_vi_en");
    });

    it("uses recent modality evidence instead of a lifetime typed failure", () => {
      const baseCard = { term: "allocate", meaningVi: "phân bổ", exampleEn: "They allocate funds." };
      const attempts = [
        makeAttempt({ questionType: "typed_vi_en", correct: false, createdAt: new Date("2026-01-01") }),
        makeAttempt({ questionType: "typed_vi_en", correct: false, createdAt: new Date("2026-01-02") }),
        makeAttempt({ questionType: "typed_vi_en", correct: true, createdAt: new Date("2026-01-03") }),
        makeAttempt({ questionType: "typed_vi_en", correct: true, createdAt: new Date("2026-01-04") }),
        makeAttempt({ questionType: "typed_vi_en", correct: true, createdAt: new Date("2026-01-05") }),
        makeAttempt({ questionType: "story_cloze", correct: false, createdAt: new Date("2026-01-06") }),
        makeAttempt({ questionType: "story_cloze", correct: false, createdAt: new Date("2026-01-07") }),
      ];

      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.breakdownByQuestionType.typedRecall.incorrect).toBe(2); // lifetime remains visible
      expect(summary.recentModalityEvidence.typedRecall).toMatchObject({ attempts: 5, incorrect: 2, latestFirstPassCorrect: true });
      expect(summary.recentModalityEvidence.storyCloze).toMatchObject({ attempts: 2, incorrect: 2, latestFirstPassCorrect: false });
      expect(selectPracticeMode(baseCard, summary, { hasStoryContext: true }).targetQuestionType).toBe("typed_vi_en");
      expect(selectPracticeMode(baseCard, summary, { hasStoryContext: false }).selectionReason).toContain("điền từ trong truyện");
    });
  });

  describe("Focused Practice Candidates & Graduation (getFocusedPracticeCandidates)", () => {
    it("24. selects candidates exclusively from NEEDS_PRACTICE/MIXED and respects limit", async () => {
      // Create 3 cards
      const c1 = await db.flashcard.create({ data: { deckId, term: "card1", normalizedTerm: "card1", meaningVi: "nghĩa 1" } });
      const c2 = await db.flashcard.create({ data: { deckId, term: "card2", normalizedTerm: "card2", meaningVi: "nghĩa 2" } });
      const c3 = await db.flashcard.create({ data: { deckId, term: "card3", normalizedTerm: "card3", meaningVi: "nghĩa 3" } });

      // c1: 2 failures -> NEEDS_PRACTICE
      await db.practiceAttempt.createMany({
        data: [
          { flashcardId: c1.id, sessionId: "s1", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: false, answer: "x", expectedAnswer: "card1" },
          { flashcardId: c1.id, sessionId: "s2", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: false, answer: "x", expectedAnswer: "card1" },
        ],
      });

      // c2: 1 pass, 1 fail -> MIXED
      await db.practiceAttempt.createMany({
        data: [
          { flashcardId: c2.id, sessionId: "s1", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "card2", expectedAnswer: "card2" },
          { flashcardId: c2.id, sessionId: "s2", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: false, answer: "x", expectedAnswer: "card2" },
        ],
      });

      // c3: 3 passes -> RECENTLY_SUCCESSFUL
      await db.practiceAttempt.createMany({
        data: [
          { flashcardId: c3.id, sessionId: "s1", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "card3", expectedAnswer: "card3" },
          { flashcardId: c3.id, sessionId: "s2", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "card3", expectedAnswer: "card3" },
          { flashcardId: c3.id, sessionId: "s3", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "card3", expectedAnswer: "card3" },
        ],
      });

      // Request candidates with limit = 10
      const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId, 10);
      const candidateIds = candidates.map((c) => c.card.id);

      // Only c1 and c2 qualify (c3 is RECENTLY_SUCCESSFUL, initial cardId has 0 attempts in this test)
      expect(candidateIds).toContain(c1.id);
      expect(candidateIds).toContain(c2.id);
      expect(candidateIds).not.toContain(c3.id);
      expect(candidateIds).not.toContain(cardId); // NO_EVIDENCE

      // Candidates have non-empty selectionReason and valid targetQuestionType
      expect(candidates.find((c) => c.card.id === c1.id)?.selectionReason).toBeTruthy();
      expect(candidates.find((c) => c.card.id === c1.id)?.targetQuestionType).toBe("typed_vi_en");

      // Bounded session limit check
      const boundedCandidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId, 1);
      expect(boundedCandidates).toHaveLength(1);
    });

    it("25. verifies card naturally graduates out of focused practice candidates after consistent successes", async () => {
      // Graduating card: start with 2 failures
      const gradCard = await db.flashcard.create({
        data: { deckId, term: "graduating", normalizedTerm: "graduating", meaningVi: "tốt nghiệp" },
      });
      await db.practiceAttempt.createMany({
        data: [
          { flashcardId: gradCard.id, sessionId: "s1", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: false, answer: "x", expectedAnswer: "graduating" },
          { flashcardId: gradCard.id, sessionId: "s2", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: false, answer: "x", expectedAnswer: "graduating" },
        ],
      });

      // Before: card is a candidate
      const before = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
      expect(before.some((c) => c.card.id === gradCard.id)).toBe(true);

      // Now add 4 consecutive correct first-pass attempts in sliding window (window size 5)
      await db.practiceAttempt.createMany({
        data: [
          { flashcardId: gradCard.id, sessionId: "s3", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "graduating", expectedAnswer: "graduating" },
          { flashcardId: gradCard.id, sessionId: "s4", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "graduating", expectedAnswer: "graduating" },
          { flashcardId: gradCard.id, sessionId: "s5", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "graduating", expectedAnswer: "graduating" },
          { flashcardId: gradCard.id, sessionId: "s6", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "graduating", expectedAnswer: "graduating" },
        ],
      });

      // Check summary: 4/5 correct in recent window >= 0.67, latest is correct -> RECENTLY_SUCCESSFUL
      const summaryAfter = await practiceEvidenceService.getFlashcardEvidenceSummary(gradCard.id);
      expect(summaryAfter.classification).toBe("RECENTLY_SUCCESSFUL");

      // After: card has naturally graduated out of focused practice candidates!
      const after = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
      expect(after.some((c) => c.card.id === gradCard.id)).toBe(false);
    });
  });
});
