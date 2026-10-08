import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  practiceEvidenceService,
  aggregateCardPracticeEvidence,
  computeSmartPracticePriority,
  PracticeSignalCategory,
  PracticeEvidenceSummary,
  NeedPracticeCardItem,
} from "./practice-evidence-service";
import { PracticeAttempt } from "@prisma/client";

/**
 * Reference implementation of unoptimized getDeckPracticeEvidence
 * as baseline characterization prior to optimization.
 */
async function referenceGetDeckPracticeEvidence(deckId: string) {
  const cards = await db.flashcard.findMany({
    where: { deckId },
    select: {
      id: true,
      deckId: true,
      term: true,
      normalizedTerm: true,
      meaningVi: true,
      ipa: true,
      partOfSpeech: true,
      cefr: true,
      status: true,
      definitionEn: true,
      exampleEn: true,
      exampleVi: true,
      stability: true,
      difficulty: true,
      lapses: true,
      reps: true,
      due: true,
      state: true,
      lastReviewAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (cards.length === 0) {
    return {
      summaries: new Map<string, PracticeEvidenceSummary>(),
      needPracticeCards: [] as NeedPracticeCardItem[],
      counts: {
        NO_EVIDENCE: 0,
        INSUFFICIENT_DATA: 0,
        NEEDS_PRACTICE: 0,
        MIXED: 0,
        RECENTLY_SUCCESSFUL: 0,
      },
    };
  }

  const cardIds = cards.map((c) => c.id);
  const allAttempts = await db.practiceAttempt.findMany({
    where: { flashcardId: { in: cardIds } },
    orderBy: { createdAt: "asc" },
  });

  const attemptsByCardId = new Map<string, PracticeAttempt[]>();
  for (const a of allAttempts) {
    const list = attemptsByCardId.get(a.flashcardId) ?? [];
    list.push(a);
    attemptsByCardId.set(a.flashcardId, list);
  }

  const summaries = new Map<string, PracticeEvidenceSummary>();
  const needPracticeCards: NeedPracticeCardItem[] = [];
  const counts: Record<PracticeSignalCategory, number> = {
    NO_EVIDENCE: 0,
    INSUFFICIENT_DATA: 0,
    NEEDS_PRACTICE: 0,
    MIXED: 0,
    RECENTLY_SUCCESSFUL: 0,
  };

  for (const card of cards) {
    const cardAttempts = attemptsByCardId.get(card.id) ?? [];
    const summary = aggregateCardPracticeEvidence(card.id, cardAttempts);
    summaries.set(card.id, summary);
    counts[summary.classification] += 1;

    if (
      summary.classification === "NEEDS_PRACTICE" ||
      summary.classification === "MIXED"
    ) {
      const { priorityScore, signals, signalReasonVi } = computeSmartPracticePriority(
        summary,
        {
          due: card.due,
          state: card.state,
          stability: card.stability,
          difficulty: card.difficulty,
          lapses: card.lapses,
          reps: card.reps,
        }
      );
      needPracticeCards.push({
        card,
        summary,
        priorityScore,
        signals,
        signalReasonVi,
      });
    }
  }

  needPracticeCards.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    const aFailRatio =
      a.summary.recentFirstPassAttempts.length > 0
        ? a.summary.recentFirstPassAttempts.filter((x) => !x.correct).length /
          a.summary.recentFirstPassAttempts.length
        : 0;
    const bFailRatio =
      b.summary.recentFirstPassAttempts.length > 0
        ? b.summary.recentFirstPassAttempts.filter((x) => !x.correct).length /
          b.summary.recentFirstPassAttempts.length
        : 0;
    if (bFailRatio !== aFailRatio) {
      return bFailRatio - aFailRatio;
    }
    const aTime = a.summary.lastPracticedAt?.getTime() ?? 0;
    const bTime = b.summary.lastPracticedAt?.getTime() ?? 0;
    if (bTime !== aTime) {
      return bTime - aTime;
    }
    return a.card.term.localeCompare(b.card.term);
  });

  return { summaries, needPracticeCards, counts };
}

function assertEvidenceEquivalence(
  actual: Awaited<ReturnType<typeof practiceEvidenceService.getDeckPracticeEvidence>>,
  expected: Awaited<ReturnType<typeof referenceGetDeckPracticeEvidence>>
) {
  expect(actual.counts).toEqual(expected.counts);
  expect(actual.needPracticeCards.length).toBe(expected.needPracticeCards.length);
  for (let i = 0; i < actual.needPracticeCards.length; i++) {
    expect(actual.needPracticeCards[i].card.id).toBe(expected.needPracticeCards[i].card.id);
    expect(actual.needPracticeCards[i].priorityScore).toBe(expected.needPracticeCards[i].priorityScore);
    expect(actual.needPracticeCards[i].signals).toEqual(expected.needPracticeCards[i].signals);
  }
  for (const [cardId, expSummary] of expected.summaries.entries()) {
    const actSummary = actual.summaries.get(cardId);
    expect(actSummary).toBeDefined();
    expect(actSummary!.classification).toBe(expSummary.classification);
    expect(actSummary!.explanationVi).toBe(expSummary.explanationVi);
    expect(actSummary!.latestFirstPassCorrect).toBe(expSummary.latestFirstPassCorrect);
    expect(actSummary!.recentFirstPassAttempts.length).toBe(expSummary.recentFirstPassAttempts.length);
    expect(actSummary!.recentFirstPassAttempts.map((a) => a.correct)).toEqual(
      expSummary.recentFirstPassAttempts.map((a) => a.correct)
    );
  }
}

describe("Practice Evidence Characterization Tests (Phase 1A Baseline)", () => {
  let deckId: string;

  beforeEach(async () => {
    const deck = await db.deck.create({
      data: { name: `CharTest-${crypto.randomUUID()}` },
    });
    deckId = deck.id;
  });

  afterEach(async () => {
    if (deckId) {
      await db.deck.delete({ where: { id: deckId } }).catch(() => {});
    }
  });

  it("Case A: Card has 0 attempts -> NO_EVIDENCE", async () => {
    const card = await db.flashcard.create({
      data: { deckId, term: "cardA", normalizedTerm: "carda", meaningVi: "nghĩa A" },
    });

    const res = await referenceGetDeckPracticeEvidence(deckId);
    const summary = res.summaries.get(card.id)!;

    expect(summary.classification).toBe("NO_EVIDENCE");
    expect(summary.firstPassAttempts).toBe(0);
    expect(res.counts.NO_EVIDENCE).toBe(1);
    expect(res.needPracticeCards).toHaveLength(0);

    const actual = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual, res);
  });

  it("Case B: 1 first-pass correct -> INSUFFICIENT_DATA", async () => {
    const card = await db.flashcard.create({
      data: { deckId, term: "cardB", normalizedTerm: "cardb", meaningVi: "nghĩa B" },
    });
    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s1",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: true,
        answer: "cardB",
        expectedAnswer: "cardB",
      },
    });

    const res = await referenceGetDeckPracticeEvidence(deckId);
    const summary = res.summaries.get(card.id)!;

    expect(summary.classification).toBe("INSUFFICIENT_DATA");
    expect(summary.firstPassAttempts).toBe(1);
    expect(summary.firstPassCorrect).toBe(1);
    expect(summary.latestFirstPassCorrect).toBe(true);
    expect(res.counts.INSUFFICIENT_DATA).toBe(1);
    expect(res.needPracticeCards).toHaveLength(0);

    const actual = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual, res);
  });

  it("Case C: 1 first-pass incorrect -> INSUFFICIENT_DATA (not permanently weak)", async () => {
    const card = await db.flashcard.create({
      data: { deckId, term: "cardC", normalizedTerm: "cardc", meaningVi: "nghĩa C" },
    });
    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s1",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong",
        expectedAnswer: "cardC",
      },
    });

    const res = await referenceGetDeckPracticeEvidence(deckId);
    const summary = res.summaries.get(card.id)!;

    expect(summary.classification).toBe("INSUFFICIENT_DATA");
    expect(summary.firstPassAttempts).toBe(1);
    expect(summary.firstPassIncorrect).toBe(1);
    expect(summary.latestFirstPassCorrect).toBe(false);
    expect(res.counts.INSUFFICIENT_DATA).toBe(1);
    expect(res.needPracticeCards).toHaveLength(0);

    const actual = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual, res);
  });

  it("Case D: 5 attempts all correct -> RECENTLY_SUCCESSFUL", async () => {
    const card = await db.flashcard.create({
      data: { deckId, term: "cardD", normalizedTerm: "cardd", meaningVi: "nghĩa D" },
    });
    for (let i = 1; i <= 5; i++) {
      await db.practiceAttempt.create({
        data: {
          flashcardId: card.id,
          sessionId: `s${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "typed_vi_en",
          correct: true,
          answer: "cardD",
          expectedAnswer: "cardD",
          createdAt: new Date(`2026-01-0${i}T10:00:00Z`),
        },
      });
    }

    const res = await referenceGetDeckPracticeEvidence(deckId);
    const summary = res.summaries.get(card.id)!;

    expect(summary.classification).toBe("RECENTLY_SUCCESSFUL");
    expect(summary.firstPassAttempts).toBe(5);
    expect(summary.firstPassCorrect).toBe(5);
    expect(summary.recentFirstPassAttempts).toHaveLength(5);
    expect(res.counts.RECENTLY_SUCCESSFUL).toBe(1);
    expect(res.needPracticeCards).toHaveLength(0);

    const actual = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual, res);
  });

  it("Case E: 3 correct / 2 incorrect -> MIXED", async () => {
    const card = await db.flashcard.create({
      data: { deckId, term: "cardE", normalizedTerm: "carde", meaningVi: "nghĩa E" },
    });
    for (let i = 1; i <= 2; i++) {
      await db.practiceAttempt.create({
        data: {
          flashcardId: card.id,
          sessionId: `s${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_en_vi",
          correct: false,
          answer: "wrong",
          expectedAnswer: "cardE",
          createdAt: new Date(`2026-01-0${i}T10:00:00Z`),
        },
      });
    }
    for (let i = 3; i <= 5; i++) {
      await db.practiceAttempt.create({
        data: {
          flashcardId: card.id,
          sessionId: `s${i}`,
          attemptNumber: 1,
          mode: "quiz",
          questionType: "multiple_choice_en_vi",
          correct: true,
          answer: "cardE",
          expectedAnswer: "cardE",
          createdAt: new Date(`2026-01-0${i}T10:00:00Z`),
        },
      });
    }

    const res = await referenceGetDeckPracticeEvidence(deckId);
    const summary = res.summaries.get(card.id)!;

    expect(summary.classification).toBe("MIXED");
    expect(summary.firstPassAttempts).toBe(5);
    expect(summary.firstPassCorrect).toBe(3);
    expect(summary.firstPassIncorrect).toBe(2);
    expect(res.counts.MIXED).toBe(1);
    expect(res.needPracticeCards).toHaveLength(1);

    const actual = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual, res);
  });

  it("Case F: Recent failure -> NEEDS_PRACTICE with correct priority", async () => {
    const card = await db.flashcard.create({
      data: { deckId, term: "cardF", normalizedTerm: "cardf", meaningVi: "nghĩa F" },
    });
    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s1",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: true,
        answer: "cardF",
        expectedAnswer: "cardF",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
    });
    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s2",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong",
        expectedAnswer: "cardF",
        createdAt: new Date("2026-01-02T10:00:00Z"),
      },
    });

    const res = await referenceGetDeckPracticeEvidence(deckId);
    const summary = res.summaries.get(card.id)!;

    expect(summary.classification).toBe("NEEDS_PRACTICE");
    expect(summary.latestFirstPassCorrect).toBe(false);
    expect(res.counts.NEEDS_PRACTICE).toBe(1);
    expect(res.needPracticeCards).toHaveLength(1);
    expect(res.needPracticeCards[0].signals).toContain("RECENT_FAILURE");
    expect(res.needPracticeCards[0].priorityScore).toBeGreaterThanOrEqual(300);

    const actual = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual, res);
  });

  it("Case G: First-pass wrong + retry wrong -> RECENT_REPEATED_FAILURE (Tier 400)", async () => {
    const card = await db.flashcard.create({
      data: { deckId, term: "cardG", normalizedTerm: "cardg", meaningVi: "nghĩa G" },
    });
    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s1",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong1",
        expectedAnswer: "cardG",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
    });
    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s1",
        attemptNumber: 2,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong2",
        expectedAnswer: "cardG",
        createdAt: new Date("2026-01-01T10:00:05Z"),
      },
    });

    const res = await referenceGetDeckPracticeEvidence(deckId);
    const summary = res.summaries.get(card.id)!;
    expect(summary.classification).toBe("INSUFFICIENT_DATA");
    expect(summary.retryIncorrect).toBe(1);

    const actual1 = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual1, res);

    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s2",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong3",
        expectedAnswer: "cardG",
        createdAt: new Date("2026-01-02T10:00:00Z"),
      },
    });
    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s2",
        attemptNumber: 2,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong4",
        expectedAnswer: "cardG",
        createdAt: new Date("2026-01-02T10:00:05Z"),
      },
    });

    const res2 = await referenceGetDeckPracticeEvidence(deckId);
    const summary2 = res2.summaries.get(card.id)!;
    expect(summary2.classification).toBe("NEEDS_PRACTICE");
    expect(res2.needPracticeCards).toHaveLength(1);
    expect(res2.needPracticeCards[0].signals).toContain("RECENT_REPEATED_FAILURE");
    expect(res2.needPracticeCards[0].priorityScore).toBeGreaterThanOrEqual(400);

    const actual2 = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual2, res2);
  });

  it("Case H: First-pass wrong + retry correct -> INSUFFICIENT_DATA / correctedOnRetry", async () => {
    const card = await db.flashcard.create({
      data: { deckId, term: "cardH", normalizedTerm: "cardh", meaningVi: "nghĩa H" },
    });
    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s1",
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "wrong",
        expectedAnswer: "cardH",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
    });
    await db.practiceAttempt.create({
      data: {
        flashcardId: card.id,
        sessionId: "s1",
        attemptNumber: 2,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: true,
        answer: "cardH",
        expectedAnswer: "cardH",
        createdAt: new Date("2026-01-01T10:00:05Z"),
      },
    });

    const res = await referenceGetDeckPracticeEvidence(deckId);
    const summary = res.summaries.get(card.id)!;

    expect(summary.classification).toBe("INSUFFICIENT_DATA");
    expect(summary.retryCorrect).toBe(1);
    expect(summary.retryIncorrect).toBe(0);
    expect(summary.explanationVi).toContain("sai lần đầu nhưng đã sửa đúng khi luyện lại");

    const actual = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual, res);
  });

  it("Case I: Card with > 100 historical attempts -> only recent window dictates classification", async () => {
    const card = await db.flashcard.create({
      data: { deckId, term: "cardI", normalizedTerm: "cardi", meaningVi: "nghĩa I" },
    });

    const baseTime2024 = new Date("2024-01-01T00:00:00Z").getTime();
    const ancientAttempts = [];
    for (let i = 1; i <= 95; i++) {
      ancientAttempts.push({
        flashcardId: card.id,
        sessionId: `ancient-${i}`,
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: false,
        answer: "fail",
        expectedAnswer: "cardI",
        createdAt: new Date(baseTime2024 + i * 1000),
      });
    }
    await db.practiceAttempt.createMany({ data: ancientAttempts });

    const recentAttempts = [];
    for (let i = 1; i <= 5; i++) {
      recentAttempts.push({
        flashcardId: card.id,
        sessionId: `recent-${i}`,
        attemptNumber: 1,
        mode: "quiz",
        questionType: "typed_vi_en",
        correct: true,
        answer: "cardI",
        expectedAnswer: "cardI",
        createdAt: new Date(`2026-01-0${i}T10:00:00Z`),
      });
    }
    await db.practiceAttempt.createMany({ data: recentAttempts });

    const res = await referenceGetDeckPracticeEvidence(deckId);
    const summary = res.summaries.get(card.id)!;

    expect(summary.firstPassAttempts).toBe(100);
    expect(summary.recentFirstPassAttempts).toHaveLength(5);
    expect(summary.recentFirstPassAttempts.every((a) => a.correct)).toBe(true);
    expect(summary.classification).toBe("RECENTLY_SUCCESSFUL");
    expect(res.counts.RECENTLY_SUCCESSFUL).toBe(1);
    expect(res.needPracticeCards).toHaveLength(0);

    const actual = await practiceEvidenceService.getDeckPracticeEvidence(deckId);
    assertEvidenceEquivalence(actual, res);
  });

  it("Combined Scenario: Multi-card deck containing cards from all categories", async () => {
    // 1. Card with 0 attempts
    const c0 = await db.flashcard.create({
      data: { deckId, term: "zero", normalizedTerm: "zero", meaningVi: "không" },
    });
    // 2. Card with 1 attempt correct
    const c1 = await db.flashcard.create({
      data: { deckId, term: "one", normalizedTerm: "one", meaningVi: "một" },
    });
    await db.practiceAttempt.create({
      data: { flashcardId: c1.id, sessionId: "s1", attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "one", expectedAnswer: "one" },
    });
    // 3. Card with 5 correct
    const cSuccess = await db.flashcard.create({
      data: { deckId, term: "perfect", normalizedTerm: "perfect", meaningVi: "hoàn hảo" },
    });
    for (let i = 1; i <= 5; i++) {
      await db.practiceAttempt.create({
        data: { flashcardId: cSuccess.id, sessionId: `s${i}`, attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: true, answer: "perfect", expectedAnswer: "perfect", createdAt: new Date(`2026-01-0${i}T10:00:00Z`) },
      });
    }
    // 4. Card with 2 failures (NEEDS_PRACTICE)
    const cWeak = await db.flashcard.create({
      data: { deckId, term: "weak", normalizedTerm: "weak", meaningVi: "yếu" },
    });
    for (let i = 1; i <= 2; i++) {
      await db.practiceAttempt.create({
        data: { flashcardId: cWeak.id, sessionId: `s${i}`, attemptNumber: 1, mode: "quiz", questionType: "typed_vi_en", correct: false, answer: "wrong", expectedAnswer: "weak", createdAt: new Date(`2026-01-0${i}T10:00:00Z`) },
      });
    }

    const ref = await referenceGetDeckPracticeEvidence(deckId);
    const act = await practiceEvidenceService.getDeckPracticeEvidence(deckId);

    assertEvidenceEquivalence(act, ref);
    expect(act.counts.NO_EVIDENCE).toBe(1);
    expect(act.counts.INSUFFICIENT_DATA).toBe(1);
    expect(act.counts.RECENTLY_SUCCESSFUL).toBe(1);
    expect(act.counts.NEEDS_PRACTICE).toBe(1);
  });
});

