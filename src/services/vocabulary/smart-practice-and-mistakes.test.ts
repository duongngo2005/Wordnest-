import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  practiceEvidenceService,
  computeSmartPracticePriority,
  aggregateCardPracticeEvidence,
} from "./practice-evidence-service";
import { PracticeAttempt } from "@prisma/client";

describe("Smart Practice Priority & Mistake Bank", () => {
  let deckId: string;

  beforeEach(async () => {
    const deck = await db.deck.create({
      data: { name: `Smart Practice & Mistake Test ${crypto.randomUUID()}` },
    });
    deckId = deck.id;
  });

  afterEach(async () => {
    if (deckId) {
      await db.deck.delete({ where: { id: deckId } }).catch(() => {});
    }
  });

  describe("computeSmartPracticePriority (Pure Heuristics)", () => {
    function makeAttempt(cardId: string, partial: Partial<PracticeAttempt> = {}): PracticeAttempt {
      return {
        id: crypto.randomUUID(),
        flashcardId: cardId,
        sessionId: "s-1",
        questionId: "q-1",
        prompt: "test prompt",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: true,
        answer: "word",
        expectedAnswer: "word",
        responseMs: 2000,
        createdAt: new Date(),
        ...partial,
      };
    }

    it("gives score 0 for NO_EVIDENCE or INSUFFICIENT_DATA", () => {
      const summaryNoEvidence = aggregateCardPracticeEvidence("c1", []);
      const p1 = computeSmartPracticePriority(summaryNoEvidence);
      expect(p1.priorityScore).toBe(0);
      expect(p1.signals).toHaveLength(0);

      const summarySingleFail = aggregateCardPracticeEvidence("c1", [
        makeAttempt("c1", { correct: false, attemptNumber: 1 }),
      ]);
      const p2 = computeSmartPracticePriority(summarySingleFail);
      expect(p2.priorityScore).toBe(0);
    });

    it("assigns Tier 400 for repeated failure (first pass wrong + retry wrong)", () => {
      const attempts = [
        makeAttempt("c1", { correct: false, attemptNumber: 1, createdAt: new Date("2026-01-01") }),
        makeAttempt("c1", { correct: false, attemptNumber: 1, createdAt: new Date("2026-01-02") }),
        makeAttempt("c1", { correct: false, attemptNumber: 2, createdAt: new Date("2026-01-02") }),
      ];
      const summary = aggregateCardPracticeEvidence("c1", attempts);
      const { priorityScore, signals } = computeSmartPracticePriority(summary);

      expect(priorityScore).toBeGreaterThanOrEqual(400);
      expect(signals).toContain("RECENT_REPEATED_FAILURE");
    });

    it("assigns Tier 300 for recent failure (latest first-pass wrong)", () => {
      const attempts = [
        makeAttempt("c1", { correct: true, attemptNumber: 1, createdAt: new Date("2026-01-01") }),
        makeAttempt("c1", { correct: true, attemptNumber: 1, createdAt: new Date("2026-01-02") }),
        makeAttempt("c1", { correct: false, attemptNumber: 1, createdAt: new Date("2026-01-03") }),
      ];
      const summary = aggregateCardPracticeEvidence("c1", attempts);
      const { priorityScore, signals } = computeSmartPracticePriority(summary);

      expect(priorityScore).toBe(300);
      expect(signals).toContain("RECENT_FAILURE");
    });

    it("adds FSRS bonuses for OVERDUE, HIGH_LAPSES, LOW_STABILITY, and SLOW_RESPONSE", () => {
      const attempts = [
        makeAttempt("c1", { correct: true, attemptNumber: 1, createdAt: new Date("2026-01-01") }),
        makeAttempt("c1", { correct: false, attemptNumber: 1, createdAt: new Date("2026-01-02"), responseMs: 9500 }),
      ];
      const summary = aggregateCardPracticeEvidence("c1", attempts);

      const fsrsSignals = {
        state: 2, // Review state
        due: new Date(Date.now() - 3600000), // Overdue by 1 hour
        stability: 1.5, // Low stability (< 3.0)
        lapses: 3, // High lapses (>= 2)
      };

      const { priorityScore, signals, signalReasonVi } = computeSmartPracticePriority(
        summary,
        fsrsSignals
      );

      // Base 300 (RECENT_FAILURE) + 60 (OVERDUE) + 35 (HIGH_LAPSES) + 25 (LOW_STABILITY) + 15 (SLOW_RESPONSE) = 435
      expect(priorityScore).toBe(435);
      expect(signals).toContain("RECENT_FAILURE");
      expect(signals).toContain("OVERDUE");
      expect(signals).toContain("HIGH_LAPSES");
      expect(signals).toContain("LOW_STABILITY");
      expect(signals).toContain("SLOW_RESPONSE");
      expect(signalReasonVi).toContain("Quá hạn ôn FSRS");
      expect(signalReasonVi).toContain("3 lần lapse");
      expect(signalReasonVi).toContain("Trí nhớ mong manh");
      expect(signalReasonVi).toContain("Phản xạ chậm");
    });
  });

  describe("getDeckMistakes & Derived Status (Database Integration)", () => {
    it("retrieves only first-pass errors and derives learning status without mutating historical attempts", async () => {
      const card = await db.flashcard.create({
        data: {
          deckId,
          term: "ubiquitous",
          normalizedTerm: "ubiquitous",
          meaningVi: "phổ biến khắp nơi",
        },
      });

      // Attempt 1: First-pass error
      const mistake1 = await db.practiceAttempt.create({
        data: {
          flashcardId: card.id,
          sessionId: "s1",
          questionId: "q1",
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          prompt: "phổ biến khắp nơi",
          answer: "everywhere",
          expectedAnswer: "ubiquitous",
          responseMs: 3200,
        },
      });

      // Attempt 2: Retry error (attemptNumber = 2, should NOT be in mistake bank as separate mistake)
      await db.practiceAttempt.create({
        data: {
          flashcardId: card.id,
          sessionId: "s1",
          questionId: "q1",
          attemptNumber: 2,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          prompt: "phổ biến khắp nơi",
          answer: "everyday",
          expectedAnswer: "ubiquitous",
          responseMs: 2500,
        },
      });

      // Verify mistake bank initial state: 1 mistake, status = NEEDS_PRACTICE
      const res1 = await practiceEvidenceService.getDeckMistakes(deckId);
      expect(res1.total).toBe(1);
      expect(res1.mistakes).toHaveLength(1);
      expect(res1.mistakes[0].id).toBe(mistake1.id);
      expect(res1.mistakes[0].userAnswer).toBe("everywhere");
      expect(res1.mistakes[0].expectedAnswer).toBe("ubiquitous");
      expect(res1.mistakes[0].derivedStatus).toBe("NEEDS_PRACTICE");
      expect(res1.counts.needsPractice).toBe(1);
      expect(res1.counts.resolved).toBe(0);

      // Now user practices subsequent times and gets 3 consecutive first-pass successes
      await db.practiceAttempt.createMany({
        data: [
          { flashcardId: card.id, sessionId: "s2", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "ubiquitous", expectedAnswer: "ubiquitous" },
          { flashcardId: card.id, sessionId: "s3", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "ubiquitous", expectedAnswer: "ubiquitous" },
          { flashcardId: card.id, sessionId: "s4", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "ubiquitous", expectedAnswer: "ubiquitous" },
        ],
      });

      // Verify historical attempt row was NOT mutated
      const recheckedRaw = await db.practiceAttempt.findUnique({ where: { id: mistake1.id } });
      expect(recheckedRaw?.correct).toBe(false);
      expect(recheckedRaw?.answer).toBe("everywhere");

      // Verify mistake bank now dynamically derives status = RESOLVED!
      const res2 = await practiceEvidenceService.getDeckMistakes(deckId);
      expect(res2.total).toBe(1);
      expect(res2.mistakes[0].derivedStatus).toBe("RESOLVED");
      expect(res2.counts.resolved).toBe(1);
      expect(res2.counts.needsPractice).toBe(0);
    });

    it("supports pagination and question-type filtering", async () => {
      const cardA = await db.flashcard.create({
        data: { deckId, term: "ephemeral", normalizedTerm: "ephemeral", meaningVi: "phù du" },
      });
      const cardB = await db.flashcard.create({
        data: { deckId, term: "resilient", normalizedTerm: "resilient", meaningVi: "kiên cường" },
      });

      // Card A failed in typed_vi_en
      await db.practiceAttempt.create({
        data: {
          flashcardId: cardA.id,
          sessionId: "s1",
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: false,
          answer: "short",
          expectedAnswer: "ephemeral",
        },
      });

      // Card B failed in fill_in_blank
      await db.practiceAttempt.create({
        data: {
          flashcardId: cardB.id,
          sessionId: "s2",
          attemptNumber: 1,
          mode: "quiz",
          questionType: "fill_in_blank",
          correct: false,
          answer: "strong",
          expectedAnswer: "resilient",
        },
      });

      // Filter: TYPED
      const typedResult = await practiceEvidenceService.getDeckMistakes(deckId, { filter: "TYPED" });
      expect(typedResult.total).toBe(1);
      expect(typedResult.mistakes[0].term).toBe("ephemeral");

      // Filter: FILL_IN_BLANK
      const fibResult = await practiceEvidenceService.getDeckMistakes(deckId, { filter: "FILL_IN_BLANK" });
      expect(fibResult.total).toBe(1);
      expect(fibResult.mistakes[0].term).toBe("resilient");

      // Pagination check: pageSize = 1
      const page1 = await practiceEvidenceService.getDeckMistakes(deckId, { page: 1, pageSize: 1 });
      expect(page1.total).toBe(2);
      expect(page1.totalPages).toBe(2);
      expect(page1.mistakes).toHaveLength(1);
    });
  });
});
