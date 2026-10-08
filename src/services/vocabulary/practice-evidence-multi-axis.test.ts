import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  practiceEvidenceService,
  getPracticeEvidenceAxis,
  classifyPracticeWindow,
  aggregateCardPracticeEvidence,
  computeCardClassification,
  selectPracticeMode,
  serializePracticeEvidenceSummary,
  computeSmartPracticePriority,
  getAxisPriorityTier,
  getNeedPracticePriority,
  isWeakCardSummary,
  isWeakAxis,
  findMatchingRetryAttempt,
  PracticeEvidenceSummary,
  PracticeEvidenceAxis,
  AxisEvidenceState,
} from "./practice-evidence-service";
import { PracticeAttempt } from "@prisma/client";

function makeAttempt(
  overrides: Partial<PracticeAttempt> & { questionType: string; correct: boolean }
): PracticeAttempt {
  return {
    id: `att_${crypto.randomUUID()}`,
    flashcardId: overrides.flashcardId ?? "card_test",
    sessionId: overrides.sessionId ?? `sess_${crypto.randomUUID()}`,
    questionId: overrides.questionId ?? `q_${crypto.randomUUID()}`,
    prompt: overrides.prompt ?? "Test prompt",
    attemptNumber: overrides.attemptNumber ?? 1,
    mode: overrides.mode ?? "quiz",
    questionType: overrides.questionType,
    correct: overrides.correct,
    answer: overrides.answer ?? (overrides.correct ? "target" : "wrong"),
    expectedAnswer: overrides.expectedAnswer ?? "target",
    responseMs: overrides.responseMs ?? 1500,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

describe("Phase 2B: Multi-Axis Practice Evidence Engine", () => {
  let deckId: string;
  let cardId: string;

  beforeEach(async () => {
    const deck = await db.deck.create({
      data: { name: `MultiAxis Test Deck ${crypto.randomUUID()}` },
    });
    deckId = deck.id;

    const card = await db.flashcard.create({
      data: {
        deckId,
        term: "resilience",
        normalizedTerm: "resilience",
        meaningVi: "khả năng phục hồi",
        exampleEn: "She showed great resilience in adversity.",
      },
    });
    cardId = card.id;
  });

  afterEach(async () => {
    if (deckId) {
      await db.deck.delete({ where: { id: deckId } }).catch(() => {});
    }
  });

  // =========================================================================
  // Section 29: Axis Mapping Tests
  // =========================================================================
  describe("Section 29: getPracticeEvidenceAxis Taxonomy", () => {
    it("maps recognition question types correctly", () => {
      expect(getPracticeEvidenceAxis("multiple_choice")).toBe("recognition");
      expect(getPracticeEvidenceAxis("multiple_choice_en_vi")).toBe("recognition");
      expect(getPracticeEvidenceAxis("multiple_choice_vi_en")).toBe("recognition");
      expect(getPracticeEvidenceAxis("fill_in_blank")).toBe("recognition");
      expect(getPracticeEvidenceAxis("story_contextual_vocab")).toBe("recognition");
    });

    it("maps production question types correctly", () => {
      expect(getPracticeEvidenceAxis("typed_vi_en")).toBe("production");
      expect(getPracticeEvidenceAxis("story_cloze")).toBe("production");
    });

    it("excludes story comprehension and unknown question types", () => {
      expect(getPracticeEvidenceAxis("story_comprehension")).toBeNull();
      expect(getPracticeEvidenceAxis("unknown_future_type")).toBeNull();
      expect(getPracticeEvidenceAxis("")).toBeNull();
    });
  });

  // =========================================================================
  // Section 3: Shared Classification Core
  // =========================================================================
  describe("Section 3: classifyPracticeWindow Core", () => {
    it("returns NO_EVIDENCE when firstPassAttempts === 0", () => {
      const res = classifyPracticeWindow({
        firstPassAttempts: 0,
        recentFirstPass: [],
        retryCorrect: 0,
        retryIncorrect: 0,
        latestFirstPassCorrect: null,
      });
      expect(res.state).toBe("NO_EVIDENCE");
    });

    it("returns INSUFFICIENT_DATA when firstPassAttempts < 2", () => {
      const res = classifyPracticeWindow({
        firstPassAttempts: 1,
        recentFirstPass: [
          { attemptNumber: 1, correct: false, questionType: "typed_vi_en", responseMs: 1000, createdAt: new Date() },
        ],
        retryCorrect: 0,
        retryIncorrect: 0,
        latestFirstPassCorrect: false,
      });
      expect(res.state).toBe("INSUFFICIENT_DATA");
    });

    it("returns STRONG when all recent first-pass attempts are correct", () => {
      const attempts = Array.from({ length: 5 }, () => ({
        attemptNumber: 1,
        correct: true,
        questionType: "typed_vi_en",
        responseMs: 1000,
        createdAt: new Date(),
      }));
      const res = classifyPracticeWindow({
        firstPassAttempts: 5,
        recentFirstPass: attempts,
        retryCorrect: 0,
        retryIncorrect: 0,
        latestFirstPassCorrect: true,
      });
      expect(res.state).toBe("STRONG");
    });

    it("returns NEEDS_PRACTICE when latest attempt is incorrect and failure ratio >= 50%", () => {
      const attempts = [
        { attemptNumber: 1, correct: false, questionType: "typed_vi_en", responseMs: 1000, createdAt: new Date() },
        { attemptNumber: 1, correct: false, questionType: "typed_vi_en", responseMs: 1000, createdAt: new Date() },
      ];
      const res = classifyPracticeWindow({
        firstPassAttempts: 2,
        recentFirstPass: attempts,
        retryCorrect: 0,
        retryIncorrect: 0,
        latestFirstPassCorrect: false,
      });
      expect(res.state).toBe("NEEDS_PRACTICE");
    });
  });

  // =========================================================================
  // Section 30: Independent Windows — Recognition Cannot Erase Production
  // =========================================================================
  describe("Section 30: 3 Typed Wrong + 5 MC Correct", () => {
    it("maintains independent axes: Recog is STRONG, Prod is NEEDS_PRACTICE, Weak is TRUE", async () => {
      const baseTime = Date.now() - 100000;
      // 3 typed wrong first
      await db.practiceAttempt.createMany({
        data: [1, 2, 3].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "wrong",
          expectedAnswer: "resilience",
          createdAt: new Date(baseTime + i * 1000),
        })),
      });

      // 5 MC correct after
      await db.practiceAttempt.createMany({
        data: [4, 5, 6, 7, 8].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(baseTime + i * 1000),
        })),
      });

      const result = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = result.summaries.get(cardId)!;

      expect(summary).toBeDefined();
      // Recognition Axis: 5 correct -> STRONG
      expect(summary.recognitionAxis.state).toBe("STRONG");
      expect(summary.recognitionAxis.recentCorrectCount).toBe(5);
      expect(summary.recognitionAxis.recentIncorrectCount).toBe(0);

      // Production Axis: 3 wrong -> NEEDS_PRACTICE (NOT ERASED BY 5 MC CORRECT!)
      expect(summary.productionAxis.state).toBe("NEEDS_PRACTICE");
      expect(summary.productionAxis.recentIncorrectCount).toBe(3);

      // Legacy overall window: 5 MC correct -> RECENTLY_SUCCESSFUL
      expect(summary.classification).toBe("RECENTLY_SUCCESSFUL");

      // Multi-Axis Weakness Rule: Card IS weak because production is NEEDS_PRACTICE!
      const weakCards = result.needPracticeCards.map((n) => n.card.id);
      expect(weakCards).toContain(cardId);
    });
  });

  // =========================================================================
  // Section 31: Inverse Case — Production Cannot Erase Recognition
  // =========================================================================
  describe("Section 31: 3 MC Wrong + 5 Typed Correct", () => {
    it("maintains independent axes: Recog is NEEDS_PRACTICE, Prod is STRONG, Weak is TRUE", async () => {
      const baseTime = Date.now() - 100000;
      // 3 MC wrong first
      await db.practiceAttempt.createMany({
        data: [1, 2, 3].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: false,
          answer: "wrong",
          expectedAnswer: "resilience",
          createdAt: new Date(baseTime + i * 1000),
        })),
      });

      // 5 Typed correct after
      await db.practiceAttempt.createMany({
        data: [4, 5, 6, 7, 8].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(baseTime + i * 1000),
        })),
      });

      const result = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = result.summaries.get(cardId)!;

      expect(summary).toBeDefined();
      // Recognition Axis: 3 wrong -> NEEDS_PRACTICE (NOT ERASED BY 5 TYPED CORRECT!)
      expect(summary.recognitionAxis.state).toBe("NEEDS_PRACTICE");

      // Production Axis: 5 correct -> STRONG
      expect(summary.productionAxis.state).toBe("STRONG");

      // Multi-Axis Weakness Rule: Card IS weak because recognition is NEEDS_PRACTICE!
      const weakCards = result.needPracticeCards.map((n) => n.card.id);
      expect(weakCards).toContain(cardId);

      // Focused Practice targets recognition modality
      const candidate = (await practiceEvidenceService.getFocusedPracticeCandidates(deckId))[0];
      expect(candidate.targetQuestionType).toBe("fill_in_blank"); // card has exampleEn
      expect(candidate.selectionReason).toContain("Nhận diện");
    });
  });

  // =========================================================================
  // Section 15 & 32: Case H Invariant (1 Typed Wrong + 20 MC Correct)
  // =========================================================================
  describe("Section 15: Case H Invariant", () => {
    it("1 typed wrong + 20 MC correct -> Recog: STRONG, Prod: INSUFFICIENT_DATA, Weak: FALSE", async () => {
      const baseTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago

      // 1 typed wrong 30 days ago
      await db.practiceAttempt.create({
        data: {
          flashcardId: cardId,
          sessionId: "sess_old_typed",
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "resilence",
          expectedAnswer: "resilience",
          createdAt: new Date(baseTime),
        },
      });

      // 20 MC correct recently
      await db.practiceAttempt.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          flashcardId: cardId,
          sessionId: `sess_mc_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(Date.now() - (20 - i) * 60 * 1000),
        })),
      });

      const result = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = result.summaries.get(cardId)!;

      expect(summary.recognitionAxis.state).toBe("STRONG");
      expect(summary.productionAxis.state).toBe("INSUFFICIENT_DATA");
      expect(summary.classification).toBe("RECENTLY_SUCCESSFUL");

      // CASE H INVARIANT: Weak must be FALSE! Card must NOT be in needPracticeCards!
      const weakCards = result.needPracticeCards.map((n) => n.card.id);
      expect(weakCards).not.toContain(cardId);
    });

    it("typed first-pass wrong + retry correct -> Prod: INSUFFICIENT_DATA, Weak: FALSE", () => {
      const attempts = [
        makeAttempt({ attemptNumber: 1, questionType: "typed_vi_en", correct: false }),
        makeAttempt({ attemptNumber: 2, questionType: "typed_vi_en", correct: true }),
      ];
      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.productionAxis.state).toBe("INSUFFICIENT_DATA");
      expect(summary.productionAxis.explanationVi).toContain("Mới có 1 lượt");
    });
  });

  // =========================================================================
  // Section 33: No Production Evidence
  // =========================================================================
  describe("Section 33: Recognition STRONG + Production NO_EVIDENCE", () => {
    it("is NOT labeled weak", async () => {
      await db.practiceAttempt.createMany({
        data: [1, 2, 3].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(Date.now() - (4 - i) * 1000),
        })),
      });

      const result = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = result.summaries.get(cardId)!;

      expect(summary.recognitionAxis.state).toBe("STRONG");
      expect(summary.productionAxis.state).toBe("NO_EVIDENCE");
      expect(result.needPracticeCards.length).toBe(0);
    });
  });

  // =========================================================================
  // Section 34: Mixed States
  // =========================================================================
  describe("Section 34: Mixed States", () => {
    it("Recognition STRONG + Production MIXED -> Weak: TRUE, Focused: typed_vi_en", () => {
      const attempts = [
        // 3 MC correct -> STRONG
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: true, createdAt: new Date("2026-01-01") }),
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: true, createdAt: new Date("2026-01-02") }),
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: true, createdAt: new Date("2026-01-03") }),
        // 1 typed wrong + 1 typed right + 1 typed wrong -> MIXED
        makeAttempt({ questionType: "typed_vi_en", correct: true, createdAt: new Date("2026-01-04") }),
        makeAttempt({ questionType: "typed_vi_en", correct: true, createdAt: new Date("2026-01-05") }),
        makeAttempt({ questionType: "typed_vi_en", correct: false, createdAt: new Date("2026-01-06") }),
      ];

      const summary = aggregateCardPracticeEvidence(cardId, attempts);
      expect(summary.recognitionAxis.state).toBe("STRONG");
      expect(summary.productionAxis.state).toBe("MIXED");

      const mode = selectPracticeMode({ term: "resilience", meaningVi: "phục hồi" }, summary, { hasStoryContext: false });
      expect(mode.targetQuestionType).toBe("typed_vi_en");
      expect(mode.selectionReason).toContain("Gõ từ");
    });
  });

  // =========================================================================
  // Section 35: Both Axes Weak & Tie-breaking
  // =========================================================================
  describe("Section 35: Both Axes Weak", () => {
    it("Case G1: newer recognition failure -> targets recognition", () => {
      const summary = aggregateCardPracticeEvidence(cardId, [
        makeAttempt({ questionType: "typed_vi_en", correct: false, createdAt: new Date("2026-01-01") }),
        makeAttempt({ questionType: "typed_vi_en", correct: false, createdAt: new Date("2026-01-02") }),
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: false, createdAt: new Date("2026-01-03") }),
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: false, createdAt: new Date("2026-01-04") }),
      ]);
      expect(summary.productionAxis.state).toBe("NEEDS_PRACTICE");
      expect(summary.recognitionAxis.state).toBe("NEEDS_PRACTICE");

      const mode = selectPracticeMode(
        { term: "resilience", meaningVi: "phục hồi", exampleEn: "Great resilience." },
        summary,
        { hasStoryContext: false }
      );
      expect(mode.targetQuestionType).toBe("fill_in_blank");
      expect(mode.selectionReason).toContain("Nhận diện");
    });

    it("Case G2: newer production failure -> targets typed_vi_en", () => {
      const summary = aggregateCardPracticeEvidence(cardId, [
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: false, createdAt: new Date("2026-01-01") }),
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: false, createdAt: new Date("2026-01-02") }),
        makeAttempt({ questionType: "typed_vi_en", correct: false, createdAt: new Date("2026-01-03") }),
        makeAttempt({ questionType: "typed_vi_en", correct: false, createdAt: new Date("2026-01-04") }),
      ]);
      expect(summary.productionAxis.state).toBe("NEEDS_PRACTICE");
      expect(summary.recognitionAxis.state).toBe("NEEDS_PRACTICE");

      const mode = selectPracticeMode(
        { term: "resilience", meaningVi: "phục hồi", exampleEn: "Great resilience." },
        summary,
        { hasStoryContext: false }
      );
      expect(mode.targetQuestionType).toBe("typed_vi_en");
      expect(mode.selectionReason).toContain("Gõ từ");
    });

    it("Case G3: same timestamp tie-break -> targets production (typed_vi_en)", () => {
      const sameTime = new Date("2026-01-05");
      const summary = aggregateCardPracticeEvidence(cardId, [
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: false, createdAt: sameTime }),
        makeAttempt({ questionType: "multiple_choice_vi_en", correct: false, createdAt: sameTime }),
        makeAttempt({ questionType: "typed_vi_en", correct: false, createdAt: sameTime }),
        makeAttempt({ questionType: "typed_vi_en", correct: false, createdAt: sameTime }),
      ]);
      expect(summary.productionAxis.state).toBe("NEEDS_PRACTICE");
      expect(summary.recognitionAxis.state).toBe("NEEDS_PRACTICE");

      const mode = selectPracticeMode(
        { term: "resilience", meaningVi: "phục hồi", exampleEn: "Great resilience." },
        summary,
        { hasStoryContext: false }
      );
      expect(mode.targetQuestionType).toBe("typed_vi_en");
    });
  });

  // =========================================================================
  // Section 36: Mistake Bank Policy A (Strict Same-Axis Resolution)
  // =========================================================================
  describe("Section 36: Mistake Bank Strict Same-Axis Resolution", () => {
    it("MC mistake is ONLY resolved when Recognition is STRONG (Prod STRONG does not resolve)", async () => {
      // 1. Create MC mistake
      await db.practiceAttempt.create({
        data: {
          flashcardId: cardId,
          sessionId: "sess_mistake_1",
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: false,
          answer: "wrong",
          expectedAnswer: "resilience",
          createdAt: new Date("2026-01-01"),
        },
      });

      // 2. Add 5 Typed correct attempts -> Production is STRONG
      await db.practiceAttempt.createMany({
        data: [1, 2, 3, 4, 5].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_prod_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(`2026-01-0${i + 1}`),
        })),
      });

      // Check Mistake Bank: MC mistake must NOT be resolved!
      const mistakesProdStrong = await practiceEvidenceService.getDeckMistakes(deckId);
      expect(mistakesProdStrong.mistakes[0].derivedStatus).toBe("NEEDS_PRACTICE");
      expect(mistakesProdStrong.counts.resolved).toBe(0);

      // 3. Now add 5 MC correct attempts -> Recognition becomes STRONG
      await db.practiceAttempt.createMany({
        data: [1, 2, 3, 4, 5].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_recog_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(`2026-01-1${i}`),
        })),
      });

      // Check Mistake Bank: MC mistake is NOW RESOLVED!
      const mistakesRecogStrong = await practiceEvidenceService.getDeckMistakes(deckId);
      expect(mistakesRecogStrong.mistakes[0].derivedStatus).toBe("RESOLVED");
      expect(mistakesRecogStrong.counts.resolved).toBe(1);
    });

    it("Typed mistake is ONLY resolved when Production is STRONG (Recog STRONG does not resolve)", async () => {
      // 1. Create Typed mistake
      await db.practiceAttempt.create({
        data: {
          flashcardId: cardId,
          sessionId: "sess_mistake_2",
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "resilence",
          expectedAnswer: "resilience",
          createdAt: new Date("2026-01-01"),
        },
      });

      // 2. Add 5 MC correct attempts -> Recognition is STRONG
      await db.practiceAttempt.createMany({
        data: [1, 2, 3, 4, 5].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_recog_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(`2026-01-0${i + 1}`),
        })),
      });

      // Check Mistake Bank: Typed mistake must NOT be resolved!
      const mistakesRecogStrong = await practiceEvidenceService.getDeckMistakes(deckId);
      expect(mistakesRecogStrong.mistakes[0].derivedStatus).toBe("NEEDS_PRACTICE");
      expect(mistakesRecogStrong.counts.resolved).toBe(0);

      // 3. Now add 5 Typed correct attempts -> Production becomes STRONG
      await db.practiceAttempt.createMany({
        data: [1, 2, 3, 4, 5].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_prod_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(`2026-01-1${i}`),
        })),
      });

      // Check Mistake Bank: Typed mistake is NOW RESOLVED!
      const mistakesProdStrong = await practiceEvidenceService.getDeckMistakes(deckId);
      expect(mistakesProdStrong.mistakes[0].derivedStatus).toBe("RESOLVED");
      expect(mistakesProdStrong.counts.resolved).toBe(1);
    });
  });

  // =========================================================================
  // Section 38: Serialization Tests
  // =========================================================================
  describe("Section 38: Date Serialization", () => {
    it("serializes axis dates to ISO strings and null to null", () => {
      const now = new Date();
      const summary = aggregateCardPracticeEvidence(cardId, [
        makeAttempt({ questionType: "typed_vi_en", correct: true, createdAt: now }),
      ]);

      const serialized = serializePracticeEvidenceSummary(summary);
      expect(serialized.productionAxis.lastFirstPassAt).toBe(now.toISOString());
      expect(serialized.recognitionAxis.lastFirstPassAt).toBeNull();
      expect(serialized.productionAxis.recentFirstPassAttempts[0].createdAt).toBe(now.toISOString());
    });
  });

  // =========================================================================
  // Section 37: Query Equivalence Test (Bounded Query vs Unbounded Reference)
  // =========================================================================
  describe("Section 37: Query Equivalence Test", () => {
    it("bounded per-axis query produces identical legacy classification and recent window as unbounded baseline", async () => {
      // Deterministic PRNG
      let seed = 12345;
      function nextRandom() {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      }

      const qTypes = [
        "typed_vi_en",
        "multiple_choice_vi_en",
        "fill_in_blank",
        "story_cloze",
        "story_contextual_vocab",
      ];

      const attemptsData = [];
      const baseTime = Date.now() - 500000;
      for (let i = 0; i < 40; i++) {
        const qType = qTypes[Math.floor(nextRandom() * qTypes.length)];
        const isCorrect = nextRandom() > 0.4;
        attemptsData.push({
          flashcardId: cardId,
          sessionId: `sess_rand_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: qType,
          correct: isCorrect,
          answer: isCorrect ? "resilience" : "wrong",
          expectedAnswer: "resilience",
          createdAt: new Date(baseTime + i * 2000),
        });
      }

      await db.practiceAttempt.createMany({ data: attemptsData });

      // 1. Fetch via bounded query
      const boundedResult = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const boundedSummary = boundedResult.summaries.get(cardId)!;

      // 2. Fetch all raw attempts for reference unbounded baseline
      const allAttempts = await db.practiceAttempt.findMany({
        where: { flashcardId: cardId },
        orderBy: { createdAt: "asc" },
      });
      const unboundedSummary = aggregateCardPracticeEvidence(cardId, allAttempts);

      // Verify exact equivalence of legacy fields
      expect(boundedSummary.classification).toBe(unboundedSummary.classification);
      expect(boundedSummary.firstPassAttempts).toBe(unboundedSummary.firstPassAttempts);
      expect(boundedSummary.firstPassCorrect).toBe(unboundedSummary.firstPassCorrect);
      expect(boundedSummary.firstPassIncorrect).toBe(unboundedSummary.firstPassIncorrect);
      expect(boundedSummary.latestFirstPassCorrect).toBe(unboundedSummary.latestFirstPassCorrect);
      expect(boundedSummary.recentFirstPassAttempts.length).toBe(unboundedSummary.recentFirstPassAttempts.length);
      for (let i = 0; i < boundedSummary.recentFirstPassAttempts.length; i++) {
        expect(boundedSummary.recentFirstPassAttempts[i].correct).toBe(
          unboundedSummary.recentFirstPassAttempts[i].correct
        );
        expect(boundedSummary.recentFirstPassAttempts[i].questionType).toBe(
          unboundedSummary.recentFirstPassAttempts[i].questionType
        );
      }

      // Verify exact equivalence of axis summaries
      expect(boundedSummary.recognitionAxis.state).toBe(unboundedSummary.recognitionAxis.state);
      expect(boundedSummary.productionAxis.state).toBe(unboundedSummary.productionAxis.state);
      expect(boundedSummary.recognitionAxis.lifetimeFirstPassAttempts).toBe(
        unboundedSummary.recognitionAxis.lifetimeFirstPassAttempts
      );
      expect(boundedSummary.productionAxis.lifetimeFirstPassAttempts).toBe(
        unboundedSummary.productionAxis.lifetimeFirstPassAttempts
      );
    });
  });

  // =========================================================================
  // Section 39: Hero Recommendation Regression
  // =========================================================================
  describe("Section 39: Hero Recommendation Regression", () => {
    it("Recognition STRONG + Production NO_EVIDENCE -> hero weak count is 0", async () => {
      const { computeDeckHeroRecommendation } = await import("./deck-hero-recommendation");
      await db.practiceAttempt.createMany({
        data: [1, 2, 3].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_hero_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(Date.now() - (4 - i) * 1000),
        })),
      });

      const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      expect(evidence.needPracticeCards.length).toBe(0);

      const recommendation = computeDeckHeroRecommendation({
        deckId,
        totalCards: 1,
        dueCardsCount: 0,
        needPracticeCardsCount: evidence.needPracticeCards.length,
        newCardsCount: 0,
      });
      // Weak cards count is 0 -> recommendation type is READ_CONTEXT
      expect(recommendation.type).toBe("READ_CONTEXT");
    });

    it("Recognition STRONG + Production NEEDS_PRACTICE -> hero weak count is 1", async () => {
      const { computeDeckHeroRecommendation } = await import("./deck-hero-recommendation");
      const baseTime = Date.now() - 100000;
      // 2 typed wrong -> Production is NEEDS_PRACTICE
      await db.practiceAttempt.createMany({
        data: [1, 2].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_hero_typed_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "wrong",
          expectedAnswer: "resilience",
          createdAt: new Date(baseTime + i * 1000),
        })),
      });

      // 5 MC correct -> Recognition is STRONG
      await db.practiceAttempt.createMany({
        data: [3, 4, 5, 6, 7].map((i) => ({
          flashcardId: cardId,
          sessionId: `sess_hero_mc_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(baseTime + i * 1000),
        })),
      });

      const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      expect(evidence.needPracticeCards.length).toBe(1);

      const recommendation = computeDeckHeroRecommendation({
        deckId,
        totalCards: 1,
        dueCardsCount: 0,
        needPracticeCardsCount: evidence.needPracticeCards.length,
        newCardsCount: 0,
      });
      // Weak cards count is 1 -> recommendation type is FOCUSED_PRACTICE!
      expect(recommendation.type).toBe("FOCUSED_PRACTICE");
    });
  });

  // =========================================================================
  // Phase 2B.1: Weakness Leakage Removal & Taxonomy Alignment
  // =========================================================================
  describe("Phase 2B.1: Weakness Leakage Removal & Taxonomy Alignment", () => {
    it("CASE 1: Recog 1 wrong, Prod 1 correct -> both INSUFFICIENT_DATA, Weak is FALSE", async () => {
      await db.practiceAttempt.createMany({
        data: [
          {
            flashcardId: cardId,
            sessionId: "sess_c1_recog",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "multiple_choice_vi_en",
            correct: false,
            answer: "wrong",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-01"),
          },
          {
            flashcardId: cardId,
            sessionId: "sess_c1_prod",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: true,
            answer: "resilience",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-02"),
          },
        ],
      });

      const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = evidence.summaries.get(cardId)!;

      expect(summary.recognitionAxis.state).toBe("INSUFFICIENT_DATA");
      expect(summary.productionAxis.state).toBe("INSUFFICIENT_DATA");
      // Multi-axis truth: INSUFFICIENT_DATA != WEAK
      expect(evidence.needPracticeCards.length).toBe(0);

      const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
      expect(candidates.length).toBe(0);
    });

    it("CASE 2: Recog 1 correct, Prod 1 wrong -> both INSUFFICIENT_DATA, Weak is FALSE", async () => {
      await db.practiceAttempt.createMany({
        data: [
          {
            flashcardId: cardId,
            sessionId: "sess_c2_recog",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "multiple_choice_vi_en",
            correct: true,
            answer: "resilience",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-01"),
          },
          {
            flashcardId: cardId,
            sessionId: "sess_c2_prod",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: false,
            answer: "wrong",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-02"),
          },
        ],
      });

      const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = evidence.summaries.get(cardId)!;

      expect(summary.recognitionAxis.state).toBe("INSUFFICIENT_DATA");
      expect(summary.productionAxis.state).toBe("INSUFFICIENT_DATA");
      expect(evidence.needPracticeCards.length).toBe(0);

      const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
      expect(candidates.length).toBe(0);
    });

    it("CASE 3: Recog 2 attempts producing MIXED, Prod INSUFFICIENT_DATA -> Weak is TRUE", async () => {
      await db.practiceAttempt.createMany({
        data: [
          // 1 wrong, 1 right in Recog -> MIXED
          {
            flashcardId: cardId,
            sessionId: "sess_c3_recog_1",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "multiple_choice_vi_en",
            correct: false,
            answer: "wrong",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-01"),
          },
          {
            flashcardId: cardId,
            sessionId: "sess_c3_recog_2",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "multiple_choice_vi_en",
            correct: true,
            answer: "resilience",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-02"),
          },
          // 1 attempt in Prod -> INSUFFICIENT_DATA
          {
            flashcardId: cardId,
            sessionId: "sess_c3_prod_1",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: true,
            answer: "resilience",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-03"),
          },
        ],
      });

      const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = evidence.summaries.get(cardId)!;

      expect(summary.recognitionAxis.state).toBe("MIXED");
      expect(summary.productionAxis.state).toBe("INSUFFICIENT_DATA");
      expect(evidence.needPracticeCards.length).toBe(1);

      const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
      expect(candidates.length).toBe(1);
      expect(candidates[0].targetQuestionType).toBe("fill_in_blank"); // remediates recognition axis
    });

    it("CASE 4: Recog STRONG, Prod 2+ attempts producing MIXED -> Weak is TRUE", async () => {
      await db.practiceAttempt.createMany({
        data: [
          // 3 Recog correct -> STRONG
          {
            flashcardId: cardId,
            sessionId: "sess_c4_r1",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "multiple_choice_vi_en",
            correct: true,
            answer: "resilience",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-01"),
          },
          {
            flashcardId: cardId,
            sessionId: "sess_c4_r2",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "multiple_choice_vi_en",
            correct: true,
            answer: "resilience",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-02"),
          },
          {
            flashcardId: cardId,
            sessionId: "sess_c4_r3",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "multiple_choice_vi_en",
            correct: true,
            answer: "resilience",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-03"),
          },
          // 1 wrong + 1 right in Prod -> MIXED
          {
            flashcardId: cardId,
            sessionId: "sess_c4_p1",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: false,
            answer: "wrong",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-04"),
          },
          {
            flashcardId: cardId,
            sessionId: "sess_c4_p2",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: true,
            answer: "resilience",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-05"),
          },
        ],
      });

      const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = evidence.summaries.get(cardId)!;

      expect(summary.recognitionAxis.state).toBe("STRONG");
      expect(summary.productionAxis.state).toBe("MIXED");
      expect(evidence.needPracticeCards.length).toBe(1);

      const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
      expect(candidates.length).toBe(1);
      expect(candidates[0].targetQuestionType).toBe("typed_vi_en"); // remediates production axis
    });

    it("CASE 5 (Case H): 1 typed wrong + 20 MC correct -> Weak is FALSE", async () => {
      // 1 typed wrong 30 days ago
      await db.practiceAttempt.create({
        data: {
          flashcardId: cardId,
          sessionId: "sess_c5_p1",
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "wrong",
          expectedAnswer: "resilience",
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      });

      // 20 MC correct recently
      await db.practiceAttempt.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          flashcardId: cardId,
          sessionId: `sess_c5_r_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_vi_en",
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(Date.now() - (20 - i) * 60 * 1000),
        })),
      });

      const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = evidence.summaries.get(cardId)!;

      expect(summary.recognitionAxis.state).toBe("STRONG");
      expect(summary.productionAxis.state).toBe("INSUFFICIENT_DATA");
      expect(summary.classification).toBe("RECENTLY_SUCCESSFUL");
      expect(evidence.needPracticeCards.length).toBe(0);

      const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
      expect(candidates.length).toBe(0);
    });

    it("CASE 6 (Critical Invariant): Legacy overall NEEDS_PRACTICE but both axes INSUFFICIENT_DATA -> Weak is FALSE", async () => {
      // 1 Recog wrong + 1 Prod wrong = 2 total first-pass attempts, both failed (100% fail ratio)
      // Legacy overall classification: NEEDS_PRACTICE
      // But Recognition axis: 1 attempt -> INSUFFICIENT_DATA
      // And Production axis: 1 attempt -> INSUFFICIENT_DATA
      await db.practiceAttempt.createMany({
        data: [
          {
            flashcardId: cardId,
            sessionId: "sess_c6_r",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "multiple_choice_vi_en",
            correct: false,
            answer: "wrong",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-01"),
          },
          {
            flashcardId: cardId,
            sessionId: "sess_c6_p",
            attemptNumber: 1,
            mode: "quiz",
            questionType: "typed_vi_en",
            correct: false,
            answer: "wrong",
            expectedAnswer: "resilience",
            createdAt: new Date("2026-01-02"),
          },
        ],
      });

      const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = evidence.summaries.get(cardId)!;

      // Legacy overall is NEEDS_PRACTICE
      expect(summary.classification).toBe("NEEDS_PRACTICE");

      // Multi-axis states are both INSUFFICIENT_DATA
      expect(summary.recognitionAxis.state).toBe("INSUFFICIENT_DATA");
      expect(summary.productionAxis.state).toBe("INSUFFICIENT_DATA");

      // CRITICAL INVARIANT: Card MUST NOT be considered weak!
      expect(evidence.needPracticeCards.length).toBe(0);

      const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(deckId);
      expect(candidates.length).toBe(0);
    });

    it("Taxonomy Consistency: All known question types are mapped identically by JS and SQL CTE", async () => {
      const allKnownTypes = [
        "multiple_choice",
        "multiple_choice_en_vi",
        "multiple_choice_vi_en",
        "fill_in_blank",
        "story_contextual_vocab",
        "typed_vi_en",
        "story_cloze",
        "story_comprehension",
        "unknown_custom_type",
      ];

      // Insert 1 attempt for each type
      await db.practiceAttempt.createMany({
        data: allKnownTypes.map((qType, i) => ({
          flashcardId: cardId,
          sessionId: `sess_tax_${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: qType,
          correct: true,
          answer: "resilience",
          expectedAnswer: "resilience",
          createdAt: new Date(Date.now() - (allKnownTypes.length - i) * 1000),
        })),
      });

      const evidence = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
      const summary = evidence.summaries.get(cardId)!;

      // Recognition types count: 5 types
      expect(summary.recognitionAxis.lifetimeFirstPassAttempts).toBe(5);
      // Production types count: 2 types
      expect(summary.productionAxis.lifetimeFirstPassAttempts).toBe(2);

      // Verify each type matches getPracticeEvidenceAxis
      for (const qType of allKnownTypes) {
        const jsAxis = getPracticeEvidenceAxis(qType);
        if (jsAxis === "recognition") {
          expect([
            "multiple_choice",
            "multiple_choice_en_vi",
            "multiple_choice_vi_en",
            "fill_in_blank",
            "story_contextual_vocab",
          ]).toContain(qType);
        } else if (jsAxis === "production") {
          expect(["typed_vi_en", "story_cloze"]).toContain(qType);
        } else {
          expect(["story_comprehension", "unknown_custom_type"]).toContain(qType);
        }
      }
    });
  });

  // =========================================================================
  // Phase 2B.2: Priority & Route Contract Verification
  // =========================================================================
  describe("Phase 2B.2: Priority & Route Contract Verification", () => {
    it("CASE A: repeated first-pass + retry failure (Tier 400) > simple recent failure (Tier 300)", () => {
      // Card 1: 2 first pass incorrect on typed_vi_en, 1 retry incorrect on typed_vi_en
      const sess1 = "sess_c1_case_a";
      const q1 = "q_c1_case_a";
      const card1Attempts = [
        makeAttempt({ flashcardId: "c1", questionType: "typed_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01T10:00:00Z") }),
        makeAttempt({ flashcardId: "c1", sessionId: sess1, questionId: q1, questionType: "typed_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-02T10:00:00Z") }),
        makeAttempt({ flashcardId: "c1", sessionId: sess1, questionId: q1, questionType: "typed_vi_en", attemptNumber: 2, correct: false, createdAt: new Date("2026-01-02T10:01:00Z") }),
      ];
      const summary1 = aggregateCardPracticeEvidence("c1", card1Attempts);
      const p1 = computeSmartPracticePriority(summary1);

      // Card 2: 2 first pass on typed_vi_en (1 correct, 1 incorrect, latest incorrect)
      const card2Attempts = [
        makeAttempt({ flashcardId: "c2", questionType: "typed_vi_en", attemptNumber: 1, correct: true, createdAt: new Date("2026-01-01") }),
        makeAttempt({ flashcardId: "c2", questionType: "typed_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-02") }),
      ];
      const summary2 = aggregateCardPracticeEvidence("c2", card2Attempts);
      const p2 = computeSmartPracticePriority(summary2);

      expect(p1.priorityScore).toBe(400);
      expect(p1.signals).toContain("RECENT_REPEATED_FAILURE");
      expect(p2.priorityScore).toBe(300);
      expect(p2.signals).toContain("RECENT_FAILURE");
      expect(p1.priorityScore).toBeGreaterThan(p2.priorityScore);
    });

    it("CASE B: recent failure (Tier 300) > mixed evidence (Tier 100)", () => {
      // Card 1: 2 first pass (1 correct, 1 incorrect, latest incorrect)
      const card1Attempts = [
        makeAttempt({ flashcardId: "c1", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: true, createdAt: new Date("2026-01-01") }),
        makeAttempt({ flashcardId: "c1", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-02") }),
      ];
      const summary1 = aggregateCardPracticeEvidence("c1", card1Attempts);
      const p1 = computeSmartPracticePriority(summary1);

      // Card 2: 2 first pass (1 incorrect, 1 correct, latest correct) -> MIXED, latest correct
      const card2Attempts = [
        makeAttempt({ flashcardId: "c2", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01") }),
        makeAttempt({ flashcardId: "c2", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: true, createdAt: new Date("2026-01-02") }),
      ];
      const summary2 = aggregateCardPracticeEvidence("c2", card2Attempts);
      const p2 = computeSmartPracticePriority(summary2);

      expect(p1.priorityScore).toBe(300);
      expect(p1.signals).toContain("RECENT_FAILURE");
      expect(p2.priorityScore).toBe(100);
      expect(p2.signals).toContain("MIXED_EVIDENCE");
      expect(p1.priorityScore).toBeGreaterThan(p2.priorityScore);
    });

    it("CASE C: high failure ratio > mixed evidence (Tier 100)", () => {
      // Card 1: 2 first pass (2 incorrect) -> NEEDS_PRACTICE, latest incorrect -> Tier 300
      const card1Attempts = [
        makeAttempt({ flashcardId: "c1", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01") }),
        makeAttempt({ flashcardId: "c1", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-02") }),
      ];
      const summary1 = aggregateCardPracticeEvidence("c1", card1Attempts);
      const p1 = computeSmartPracticePriority(summary1);

      // Card 2: 2 first pass (1 incorrect, 1 correct, latest correct) -> MIXED, latest correct -> Tier 100
      const card2Attempts = [
        makeAttempt({ flashcardId: "c2", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01") }),
        makeAttempt({ flashcardId: "c2", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: true, createdAt: new Date("2026-01-02") }),
      ];
      const summary2 = aggregateCardPracticeEvidence("c2", card2Attempts);
      const p2 = computeSmartPracticePriority(summary2);

      expect(summary1.recognitionAxis.state).toBe("NEEDS_PRACTICE");
      expect(p1.priorityScore).toBe(300);
      expect(p1.signals).toContain("RECENT_FAILURE");

      expect(summary2.recognitionAxis.state).toBe("MIXED");
      expect(p2.priorityScore).toBe(100);
      expect(p2.signals).toContain("MIXED_EVIDENCE");

      expect(p1.priorityScore).toBeGreaterThan(p2.priorityScore);
    });

    it("CASE D: non-weak axis-insufficient card -> priority = 0 (eligibility gate wins)", () => {
      // 1 recognition incorrect, 1 production correct
      const attempts = [
        makeAttempt({ flashcardId: "c1", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01") }),
        makeAttempt({ flashcardId: "c1", questionType: "typed_vi_en", attemptNumber: 1, correct: true, createdAt: new Date("2026-01-02") }),
      ];
      const summary = aggregateCardPracticeEvidence("c1", attempts);

      expect(isWeakCardSummary(summary)).toBe(false);
      expect(summary.recognitionAxis.state).toBe("INSUFFICIENT_DATA");
      expect(summary.productionAxis.state).toBe("INSUFFICIENT_DATA");

      const p = computeSmartPracticePriority(summary);
      expect(p.priorityScore).toBe(0);
      expect(p.signals).toHaveLength(0);
      expect(getNeedPracticePriority(summary)).toBe(0);
    });

    it("CASE E: Production repeated failure vs Recognition mixed -> Production repeated failure ranked higher", () => {
      // Card 1: Production repeated failure (2 first pass wrong, 1 retry wrong on typed),
      // followed by 10 correct attempts on recognition (making latest first-pass on card overall correct).
      const sessE = "sess_e_case_e";
      const qE = "q_e_case_e";
      const card1Attempts = [
        makeAttempt({ flashcardId: "c1", questionType: "typed_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-01T10:00:00Z") }),
        makeAttempt({ flashcardId: "c1", sessionId: sessE, questionId: qE, questionType: "typed_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-02T10:00:00Z") }),
        makeAttempt({ flashcardId: "c1", sessionId: sessE, questionId: qE, questionType: "typed_vi_en", attemptNumber: 2, correct: false, createdAt: new Date("2026-01-02T10:01:00Z") }),
        ...Array.from({ length: 10 }, (_, i) =>
          makeAttempt({
            flashcardId: "c1",
            questionType: "multiple_choice_vi_en",
            attemptNumber: 1,
            correct: true,
            createdAt: new Date(`2026-01-1${i}`),
          })
        ),
      ];
      const summary1 = aggregateCardPracticeEvidence("c1", card1Attempts);
      const p1 = computeSmartPracticePriority(summary1);

      // Card 2: Recognition mixed (2 correct, 1 wrong, latest wrong -> fail ratio 33% < 50% -> MIXED)
      const card2Attempts = [
        makeAttempt({ flashcardId: "c2", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: true, createdAt: new Date("2026-01-01") }),
        makeAttempt({ flashcardId: "c2", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: true, createdAt: new Date("2026-01-02") }),
        makeAttempt({ flashcardId: "c2", questionType: "multiple_choice_vi_en", attemptNumber: 1, correct: false, createdAt: new Date("2026-01-03") }),
      ];
      const summary2 = aggregateCardPracticeEvidence("c2", card2Attempts);
      const p2 = computeSmartPracticePriority(summary2);

      // Card 1 production axis is weak with repeated failure -> Tier 400
      expect(summary1.productionAxis.state).toBe("NEEDS_PRACTICE");
      expect(p1.priorityScore).toBe(400);
      expect(p1.signals).toContain("RECENT_REPEATED_FAILURE");

      // Card 2 recognition axis is weak with recent failure -> Tier 300
      expect(summary2.recognitionAxis.state).toBe("MIXED");
      expect(p2.priorityScore).toBe(300);
      expect(p2.signals).toContain("RECENT_FAILURE");

      // Card 1 MUST rank higher than Card 2!
      expect(p1.priorityScore).toBeGreaterThan(p2.priorityScore);
    });

    it("Legacy Enum Terminology & Serialization Contract: summary.classification strictly uses RECENTLY_SUCCESSFUL and NEVER STRONG", () => {
      const attempts = Array.from({ length: 5 }, (_, i) =>
        makeAttempt({
          flashcardId: cardId,
          questionType: "multiple_choice_vi_en",
          attemptNumber: 1,
          correct: true,
          createdAt: new Date(`2026-01-0${i + 1}`),
        })
      );
      const summary = aggregateCardPracticeEvidence(cardId, attempts);

      // 1. Legacy overall classification MUST be RECENTLY_SUCCESSFUL
      expect(summary.classification).toBe("RECENTLY_SUCCESSFUL");
      expect((summary.classification as string)).not.toBe("STRONG");

      // 2. New axis state MUST be STRONG
      expect(summary.recognitionAxis.state).toBe("STRONG");
      expect(summary.productionAxis.state).toBe("NO_EVIDENCE");

      // 3. Serialization MUST preserve legacy enum
      const serialized = serializePracticeEvidenceSummary(summary);
      expect(serialized.classification).toBe("RECENTLY_SUCCESSFUL");
      expect((serialized.classification as string)).not.toBe("STRONG");
      expect(serialized.recognitionAxis.state).toBe("STRONG");
    });

    it("Route Contract: Strictly separates Cram, Regular Quiz, Focused Practice, and Targeted Mistakes", () => {
      const deckTestId = "test-deck-contracts";

      // 1. Cram / Free Browsing
      const cramUrl = `/decks/${deckTestId}/practice`;
      expect(cramUrl).toBe("/decks/test-deck-contracts/practice");
      expect(cramUrl).not.toContain("quiz");
      expect(cramUrl).not.toContain("mode=focused_practice");

      // 2. Regular Quiz
      const quizUrl = `/decks/${deckTestId}/quiz`;
      expect(quizUrl).toBe("/decks/test-deck-contracts/quiz");
      expect(quizUrl).not.toContain("practice");

      // 3. Focused Practice (All weak cards)
      const focusedUrl = `/decks/${deckTestId}/quiz?mode=focused_practice`;
      expect(focusedUrl).toBe("/decks/test-deck-contracts/quiz?mode=focused_practice");
      expect(focusedUrl).not.toContain("/decks/test-deck-contracts/practice");

      // 4. Targeted Mistake Practice (Selected cards)
      const targetedUrl = `/decks/${deckTestId}/quiz?mode=focused_practice&cardIds=c1,c2`;
      expect(targetedUrl).toBe("/decks/test-deck-contracts/quiz?mode=focused_practice&cardIds=c1,c2");
      expect(targetedUrl).not.toContain("/decks/test-deck-contracts/practice");
    });
  });

  // =========================================================================
  // Phase 2B.3: Priority Correlation & Retry Association
  // =========================================================================
  describe("Phase 2B.3: Priority Correlation & Retry Association", () => {
    it("CASE A: Historical retry failure, fresh first-pass failure, NO retry -> Tier 300 RECENT_FAILURE, NOT Tier 400", () => {
      // 3 months ago (sess_old): first-pass incorrect, retry incorrect
      // Today (sess_new): first-pass incorrect, no retry yet
      const attempts = [
        makeAttempt({
          flashcardId: "card_a",
          sessionId: "sess_old",
          questionId: "q_old",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2025-10-01T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_a",
          sessionId: "sess_old",
          questionId: "q_old",
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: false,
          createdAt: new Date("2025-10-01T10:01:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_a",
          sessionId: "sess_new",
          questionId: "q_new",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        }),
      ];

      const summary = aggregateCardPracticeEvidence("card_a", attempts);
      expect(summary.productionAxis.latestFirstPassMatchingRetryCorrect).toBeNull();
      expect(summary.productionAxis.lifetimeRetryIncorrect).toBe(1);

      const priority = computeSmartPracticePriority(summary);
      expect(priority.priorityScore).toBe(300);
      expect(priority.signals).toContain("RECENT_FAILURE");
      expect(priority.signals).not.toContain("RECENT_REPEATED_FAILURE");
    });

    it("CASE B: Historical retry failure, fresh first-pass failure, FRESH RETRY CORRECT -> Tier 300, NOT Tier 400", () => {
      // 3 months ago: first-pass incorrect, retry incorrect
      // Today: first-pass incorrect, retry CORRECT
      const attempts = [
        makeAttempt({
          flashcardId: "card_b",
          sessionId: "sess_old",
          questionId: "q_old",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2025-10-01T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_b",
          sessionId: "sess_old",
          questionId: "q_old",
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: false,
          createdAt: new Date("2025-10-01T10:01:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_b",
          sessionId: "sess_new",
          questionId: "q_new",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_b",
          sessionId: "sess_new",
          questionId: "q_new",
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: true,
          createdAt: new Date("2026-01-01T10:01:00Z"),
        }),
      ];

      const summary = aggregateCardPracticeEvidence("card_b", attempts);
      expect(summary.productionAxis.latestFirstPassMatchingRetryCorrect).toBe(true);
      expect(summary.productionAxis.lifetimeRetryIncorrect).toBe(1);
      expect(summary.productionAxis.lifetimeRetryCorrect).toBe(1);

      const priority = computeSmartPracticePriority(summary);
      expect(priority.priorityScore).toBe(300);
      expect(priority.signals).toContain("RECENT_FAILURE");
      expect(priority.signals).not.toContain("RECENT_REPEATED_FAILURE");
    });

    it("CASE C: True repeated failure -> Tier 400 RECENT_REPEATED_FAILURE", () => {
      // Today: first-pass incorrect, retry INCORRECT in same session
      const attempts = [
        makeAttempt({
          flashcardId: "card_c",
          sessionId: "sess_c",
          questionId: "q_c",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_c",
          sessionId: "sess_c",
          questionId: "q_c",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2026-01-02T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_c",
          sessionId: "sess_c",
          questionId: "q_c",
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: false,
          createdAt: new Date("2026-01-02T10:01:00Z"),
        }),
      ];

      const summary = aggregateCardPracticeEvidence("card_c", attempts);
      expect(summary.productionAxis.latestFirstPassMatchingRetryCorrect).toBe(false);

      const priority = computeSmartPracticePriority(summary);
      expect(priority.priorityScore).toBe(400);
      expect(priority.signals).toContain("RECENT_REPEATED_FAILURE");
    });

    it("CASE D: First-pass correct, historical retry incorrect -> NOT Tier 400, NOT Tier 300", () => {
      // 3 months ago: first-pass incorrect, retry incorrect
      // Today: 2 first-pass correct
      const attempts = [
        makeAttempt({
          flashcardId: "card_d",
          sessionId: "sess_old",
          questionId: "q_old",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2025-10-01T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_d",
          sessionId: "sess_old",
          questionId: "q_old",
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: false,
          createdAt: new Date("2025-10-01T10:01:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_d",
          sessionId: "sess_new_1",
          questionId: "q_new_1",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: true,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_d",
          sessionId: "sess_new_2",
          questionId: "q_new_2",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: true,
          createdAt: new Date("2026-01-02T10:00:00Z"),
        }),
      ];

      const summary = aggregateCardPracticeEvidence("card_d", attempts);
      expect(summary.productionAxis.latestFirstPassMatchingRetryCorrect).toBeNull();
      expect(summary.productionAxis.latestFirstPassCorrect).toBe(true);

      const priority = computeSmartPracticePriority(summary);
      expect(priority.priorityScore).not.toBe(400);
      expect(priority.priorityScore).not.toBe(300);
      expect(priority.signals).not.toContain("RECENT_REPEATED_FAILURE");
      expect(priority.signals).not.toContain("RECENT_FAILURE");
    });

    it("CASE E: Multi-axis isolation of retry correlation", () => {
      // Production: historical retry incorrect, fresh first-pass correct (2 times -> STRONG)
      // Recognition: 2 first pass incorrect, fresh retry incorrect
      const attempts = [
        // Production: old fail + retry fail
        makeAttempt({
          flashcardId: "card_e",
          sessionId: "sess_prod_old",
          questionId: "q_p_old",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2025-10-01T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_e",
          sessionId: "sess_prod_old",
          questionId: "q_p_old",
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: false,
          createdAt: new Date("2025-10-01T10:01:00Z"),
        }),
        // Production: fresh first-pass correct
        makeAttempt({
          flashcardId: "card_e",
          sessionId: "sess_prod_new_1",
          questionId: "q_p_new_1",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: true,
          createdAt: new Date("2026-01-01T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_e",
          sessionId: "sess_prod_new_2",
          questionId: "q_p_new_2",
          questionType: "typed_vi_en",
          attemptNumber: 1,
          correct: true,
          createdAt: new Date("2026-01-02T10:00:00Z"),
        }),
        // Recognition: 2 first-pass wrong, latest retry wrong in same session
        makeAttempt({
          flashcardId: "card_e",
          sessionId: "sess_recog_1",
          questionId: "q_r_1",
          questionType: "multiple_choice_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2026-01-03T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_e",
          sessionId: "sess_recog_2",
          questionId: "q_r_2",
          questionType: "multiple_choice_vi_en",
          attemptNumber: 1,
          correct: false,
          createdAt: new Date("2026-01-04T10:00:00Z"),
        }),
        makeAttempt({
          flashcardId: "card_e",
          sessionId: "sess_recog_2",
          questionId: "q_r_2",
          questionType: "multiple_choice_vi_en",
          attemptNumber: 2,
          correct: false,
          createdAt: new Date("2026-01-04T10:01:00Z"),
        }),
      ];

      const summary = aggregateCardPracticeEvidence("card_e", attempts);

      expect(summary.recognitionAxis.latestFirstPassMatchingRetryCorrect).toBe(false);
      expect(summary.productionAxis.latestFirstPassMatchingRetryCorrect).toBeNull();

      expect(getAxisPriorityTier(summary.recognitionAxis).tier).toBe(400);
      expect(getAxisPriorityTier(summary.productionAxis).tier).not.toBe(400);

      const priority = computeSmartPracticePriority(summary);
      expect(priority.priorityScore).toBe(400);
      expect(priority.signals).toContain("RECENT_REPEATED_FAILURE");
    });

    it("Retry Join Identity: rejects mismatched questionId, sessionId, attemptNumber, or axis", () => {
      const baseFp = {
        flashcardId: "card_id_test",
        sessionId: "sess_match",
        questionId: "q_match",
        questionType: "typed_vi_en",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      };

      // 1. Mismatched questionId -> does not match
      const attemptsDifferentQ = [
        {
          flashcardId: "card_id_test",
          sessionId: "sess_match",
          questionId: "q_DIFFERENT",
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: true,
          createdAt: new Date("2026-01-01T10:01:00Z"),
        },
      ];
      expect(findMatchingRetryAttempt(baseFp, attemptsDifferentQ)).toBeNull();

      // 2. Mismatched sessionId -> does not match
      const attemptsDifferentSess = [
        {
          flashcardId: "card_id_test",
          sessionId: "sess_DIFFERENT",
          questionId: "q_match",
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: true,
          createdAt: new Date("2026-01-01T10:01:00Z"),
        },
      ];
      expect(findMatchingRetryAttempt(baseFp, attemptsDifferentSess)).toBeNull();

      // 3. attemptNumber !== 2 -> does not match
      const attemptsAttempt3 = [
        {
          flashcardId: "card_id_test",
          sessionId: "sess_match",
          questionId: "q_match",
          questionType: "typed_vi_en",
          attemptNumber: 3,
          correct: true,
          createdAt: new Date("2026-01-01T10:01:00Z"),
        },
      ];
      expect(findMatchingRetryAttempt(baseFp, attemptsAttempt3)).toBeNull();

      // 4. questionType has different axis (e.g. MC retry for typed first pass) -> does not match
      const attemptsDifferentAxis = [
        {
          flashcardId: "card_id_test",
          sessionId: "sess_match",
          questionId: "q_match",
          questionType: "multiple_choice_vi_en",
          attemptNumber: 2,
          correct: true,
          createdAt: new Date("2026-01-01T10:01:00Z"),
        },
      ];
      expect(findMatchingRetryAttempt(baseFp, attemptsDifferentAxis)).toBeNull();

      // 5. questionId is null on both -> falls back to (sessionId, flashcardId) match
      const baseFpNullQ = {
        flashcardId: "card_id_test",
        sessionId: "sess_match",
        questionId: null,
        questionType: "typed_vi_en",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      };
      const attemptsNullQ = [
        {
          flashcardId: "card_id_test",
          sessionId: "sess_match",
          questionId: null,
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: true,
          createdAt: new Date("2026-01-01T10:01:00Z"),
        },
      ];
      expect(findMatchingRetryAttempt(baseFpNullQ, attemptsNullQ)?.correct).toBe(true);

      // 6. Valid exact match -> succeeds
      const attemptsExact = [
        {
          flashcardId: "card_id_test",
          sessionId: "sess_match",
          questionId: "q_match",
          questionType: "typed_vi_en",
          attemptNumber: 2,
          correct: false,
          createdAt: new Date("2026-01-01T10:01:00Z"),
        },
      ];
      expect(findMatchingRetryAttempt(baseFp, attemptsExact)?.correct).toBe(false);
    });
  });
});
