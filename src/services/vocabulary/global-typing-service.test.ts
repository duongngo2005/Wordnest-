import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  DUE_TYPING_MODE,
  GLOBAL_TYPING_ASSISTED_MODE,
  GLOBAL_TYPING_MODE,
  globalTypingPracticeService,
  globalTypingWeight,
  selectGlobalTypingCardIds,
  type GlobalTypingCandidateEvidence,
  type GlobalTypingCard,
} from "./global-typing-service";
import { practiceEvidenceService, type PracticeAxisSummary } from "./practice-evidence-service";
import { progressService } from "./progress-service";
import { fsrsService } from "@/services/fsrs";

const now = new Date("2026-10-12T10:00:00.000Z");

function typedEvidence(overrides: Partial<PracticeAxisSummary> = {}): PracticeAxisSummary {
  return {
    axis: "production",
    state: "NO_EVIDENCE",
    lifetimeFirstPassAttempts: 0,
    lifetimeFirstPassCorrect: 0,
    lifetimeFirstPassIncorrect: 0,
    lifetimeRetryAttempts: 0,
    lifetimeRetryCorrect: 0,
    lifetimeRetryIncorrect: 0,
    recentFirstPassAttempts: [],
    recentAttemptsCount: 0,
    recentCorrectCount: 0,
    recentIncorrectCount: 0,
    latestFirstPassCorrect: null,
    lastFirstPassAt: null,
    latestFirstPassMatchingRetryCorrect: null,
    explanationVi: "Chưa có dữ liệu",
    ...overrides,
  };
}

function candidate(index: number): GlobalTypingCard {
  return {
    id: `card-${index}`,
    term: `term-${index}`,
    normalizedTerm: `term-${index}`,
    meaningVi: `nghĩa ${index}`,
    definitionEn: null,
    ipa: null,
    partOfSpeech: "verb",
    cefr: null,
    exampleEn: null,
    exampleVi: null,
    createdAt: now,
  };
}

describe("global typing selection", () => {
  it("deduplicates a randomized global queue and gives recent weakness a bounded preference", () => {
    const cards = Array.from({ length: 12 }, (_, index) => candidate(index + 1));
    const weak: GlobalTypingCandidateEvidence = {
      typed: typedEvidence({
        state: "NEEDS_PRACTICE",
        lifetimeFirstPassAttempts: 4,
        lifetimeFirstPassIncorrect: 3,
        recentIncorrectCount: 3,
        latestFirstPassCorrect: false,
        lastFirstPassAt: new Date("2026-10-11T10:00:00.000Z"),
      }),
      repeatedTypingErrorCount: 3,
    };
    const stable: GlobalTypingCandidateEvidence = {
      typed: typedEvidence({
        state: "STRONG",
        lifetimeFirstPassAttempts: 6,
        lifetimeFirstPassCorrect: 6,
        latestFirstPassCorrect: true,
        lastFirstPassAt: new Date("2026-10-11T10:00:00.000Z"),
      }),
      repeatedTypingErrorCount: 0,
    };
    const oldWeak: GlobalTypingCandidateEvidence = {
      typed: typedEvidence({
        state: "NEEDS_PRACTICE",
        lifetimeFirstPassAttempts: 4,
        lifetimeFirstPassIncorrect: 4,
        latestFirstPassCorrect: false,
        lastFirstPassAt: new Date("2025-01-01T10:00:00.000Z"),
      }),
      repeatedTypingErrorCount: 0,
    };
    const evidence = new Map<string, GlobalTypingCandidateEvidence>([
      [cards[0]!.id, weak],
      [cards[1]!.id, stable],
      [cards[2]!.id, oldWeak],
    ]);

    expect(globalTypingWeight(weak, now)).toBeGreaterThan(globalTypingWeight(stable, now));
    expect(globalTypingWeight(oldWeak, now)).toBeLessThan(globalTypingWeight(weak, now));

    const selected = selectGlobalTypingCardIds(
      cards,
      evidence,
      10,
      "all",
      now,
      () => 0.5
    );
    expect(selected).toHaveLength(10);
    expect(new Set(selected)).toHaveLength(10);

    expect(
      selectGlobalTypingCardIds([cards[0]!, cards[1]!], evidence, 1, "all", now, () => 0.5)
    ).toEqual([cards[0]!.id]);

    const weakOnly = selectGlobalTypingCardIds(cards, evidence, 10, "weak", now, () => 0.5);
    expect(weakOnly).toEqual([cards[0]!.id]);
  });
});

describe("GlobalTypingPracticeService", () => {
  it("builds one canonical pool across Decks and includes unassigned vocabulary once", async () => {
    const [firstDeck, secondDeck] = await Promise.all([
      db.deck.create({ data: { name: "Global typing first" } }),
      db.deck.create({ data: { name: "Global typing second" } }),
    ]);
    const shared = await db.flashcard.create({
      data: {
        deckId: firstDeck.id,
        term: "allocate",
        normalizedTerm: "allocate",
        meaningVi: "phân bổ",
        partOfSpeech: "verb",
      },
    });
    await db.deckVocabularyMembership.create({
      data: { deckId: secondDeck.id, flashcardId: shared.id },
    });
    const second = await db.flashcard.create({
      data: {
        deckId: secondDeck.id,
        term: "resilient",
        normalizedTerm: "resilient",
        meaningVi: "kiên cường",
        partOfSpeech: "adjective",
      },
    });
    const unassigned = await db.flashcard.create({
      data: {
        term: "orphan",
        normalizedTerm: "orphan",
        meaningVi: "trẻ mồ côi",
        partOfSpeech: "noun",
      },
    });

    const session = await globalTypingPracticeService.createSession({ count: 10 }, new Date(), () => 0.5);
    const ids = session.questions.map((question) => question.cardId);

    expect(session.emptyReason).toBeNull();
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(new Set([shared.id, second.id, unassigned.id]));
    expect(session.questions.every((question) => question.type === "typed_vi_en")).toBe(true);
    expect(session.questions.every((question) => question.correctAnswer === undefined)).toBe(true);
  });

  it("adds exact-target context for an ambiguous Vietnamese cue and records only the canonical target", async () => {
    const deck = await db.deck.create({ data: { name: "Global typing collision" } });
    const resolve = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "resolve",
        normalizedTerm: "resolve",
        meaningVi: "giải quyết",
        partOfSpeech: "verb",
        exampleEn: "The report should resolve the safety concerns.",
      },
    });
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "address",
        normalizedTerm: "address",
        meaningVi: "giải quyết",
        partOfSpeech: "verb",
        exampleEn: "The report should address the safety concerns.",
      },
    });

    const session = await globalTypingPracticeService.createSession({ count: 10 }, new Date(), () => 0.5);
    const resolveQuestion = session.questions.find((question) => question.cardId === resolve.id);
    expect(resolveQuestion).toMatchObject({
      prompt: "giải quyết",
      cueContext: "The report should _____ the safety concerns.",
    });

    const check = await globalTypingPracticeService.checkAnswer({
      sessionId: session.sessionId,
      questionId: resolveQuestion!.id,
      answer: "address",
    });
    expect(check).toMatchObject({ correct: false, collisionSiblingAnswer: true, expectedAnswer: "resolve" });
  });

  it("persists one first-pass typo transactionally and never mutates FSRS or ReviewLog", async () => {
    const deck = await db.deck.create({ data: { name: "Global typing persistence" } });
    const card = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "allocate",
        normalizedTerm: "allocate",
        meaningVi: "phân bổ",
        partOfSpeech: "verb",
        state: 2,
        stability: 8,
        difficulty: 4,
        reps: 6,
        lapses: 1,
        due: new Date("2026-11-01T00:00:00.000Z"),
      },
    });
    const before = await db.flashcard.findUniqueOrThrow({ where: { id: card.id } });
    const session = await globalTypingPracticeService.createSession({ count: 10 }, new Date(), () => 0.5);
    const stored = await db.quizSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    const questions = stored.questions as Array<{ id: string; correctAnswer: string }>;
    const payload = {
      sessionId: session.sessionId,
      answers: questions.map((question) => ({ questionId: question.id, answer: "alocate", responseMs: 1_000 })),
    };

    const outcomes = await Promise.allSettled([
      globalTypingPracticeService.submit(payload),
      globalTypingPracticeService.submit(payload),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);

    const [attempts, quizAttempts, reviewLogs, after] = await Promise.all([
      db.practiceAttempt.findMany({ where: { sessionId: session.sessionId } }),
      db.quizAttempt.findMany({ where: { deckId: null } }),
      db.reviewLog.findMany({ where: { cardId: card.id } }),
      db.flashcard.findUniqueOrThrow({ where: { id: card.id } }),
    ]);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      flashcardId: card.id,
      mode: GLOBAL_TYPING_MODE,
      questionType: "typed_vi_en",
      attemptNumber: 1,
      correct: false,
      answer: "alocate",
      expectedAnswer: "allocate",
    });
    expect(quizAttempts).toHaveLength(1);
    expect(reviewLogs).toHaveLength(0);
    expect(after).toMatchObject({
      state: before.state,
      stability: before.stability,
      difficulty: before.difficulty,
      reps: before.reps,
      lapses: before.lapses,
      due: before.due,
    });
  });

  it("records a requested hint as assisted evidence instead of unassisted success", async () => {
    const deck = await db.deck.create({ data: { name: "Global typing assisted" } });
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "allocate",
        normalizedTerm: "allocate",
        meaningVi: "phân bổ",
        partOfSpeech: "verb",
      },
    });
    const session = await globalTypingPracticeService.createSession({ count: 10 }, new Date(), () => 0.5);
    const question = session.questions[0]!;

    await globalTypingPracticeService.recordHint(session.sessionId, question.id);
    const stored = await db.quizSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    const storedQuestion = (stored.questions as Array<{ id: string; correctAnswer: string; mode?: string }>)[0]!;
    expect(storedQuestion.mode).toBe(GLOBAL_TYPING_ASSISTED_MODE);

    await globalTypingPracticeService.submit({
      sessionId: session.sessionId,
      answers: [{ questionId: storedQuestion.id, answer: storedQuestion.correctAnswer }],
    });
    const attempt = await db.practiceAttempt.findFirstOrThrow({ where: { sessionId: session.sessionId } });
    expect(attempt).toMatchObject({ correct: true, mode: GLOBAL_TYPING_ASSISTED_MODE });

    const directEvidence = await practiceEvidenceService.getTypedChallengeEvidenceForFlashcardIds(
      [attempt.flashcardId],
      { excludeAssistedGlobalTypingCorrect: true }
    );
    expect(directEvidence.has(attempt.flashcardId)).toBe(false);
  });

  it("keeps an immediate correction as retry reinforcement, not a second first-pass statistic", async () => {
    const deck = await db.deck.create({ data: { name: "Global typing retry" } });
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "resilient",
        normalizedTerm: "resilient",
        meaningVi: "kiên cường",
        partOfSpeech: "adjective",
      },
    });
    const session = await globalTypingPracticeService.createSession({ count: 10 }, new Date(), () => 0.5);
    const stored = await db.quizSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    const question = (stored.questions as Array<{ id: string; correctAnswer: string }>)[0]!;
    await globalTypingPracticeService.submit({
      sessionId: session.sessionId,
      answers: [
        { questionId: question.id, attemptNumber: 1, answer: "resiliant" },
        { questionId: question.id, attemptNumber: 2, answer: question.correctAnswer },
      ],
    });

    const attempts = await db.practiceAttempt.findMany({
      where: { sessionId: session.sessionId },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts.map((attempt) => [attempt.attemptNumber, attempt.correct])).toEqual([
      [1, false],
      [2, true],
    ]);
    const analytics = await progressService.getGlobalAnalytics("Asia/Ho_Chi_Minh");
    expect(analytics.globalTyping).toMatchObject({ total: 1, correct: 0, incorrect: 1, sessions: 1 });
  });
});

describe("due-only typing", () => {
  it("snapshots exactly the shuffled global FSRS due queue without changing FSRS or ReviewLogs", async () => {
    const snapshotNow = new Date();
    const [firstDeck, secondDeck] = await Promise.all([
      db.deck.create({ data: { name: "Due typing first" } }),
      db.deck.create({ data: { name: "Due typing second" } }),
    ]);
    const dueCards = await Promise.all(
      Array.from({ length: 41 }, (_, index) =>
        db.flashcard.create({
          data: {
            deckId: firstDeck.id,
            term: `due-term-${index + 1}`,
            normalizedTerm: `due-term-${index + 1}`,
            meaningVi: `nghĩa đến hạn ${index + 1}`,
            partOfSpeech: "noun",
            state: 2,
            due: new Date(snapshotNow.getTime() - (41 - index) * 1_000),
            stability: index + 1,
            difficulty: 3.5,
            elapsedDays: index,
            scheduledDays: index + 2,
            learningSteps: 0,
            reps: index + 2,
            lapses: index % 3,
          },
        })
      )
    );
    await db.deckVocabularyMembership.create({
      data: { deckId: secondDeck.id, flashcardId: dueCards[0]!.id },
    });
    await Promise.all([
      ...Array.from({ length: 30 }, (_, index) =>
        db.flashcard.create({
          data: {
            deckId: firstDeck.id,
            term: `future-term-${index + 1}`,
            normalizedTerm: `future-term-${index + 1}`,
            meaningVi: `nghĩa tương lai ${index + 1}`,
            partOfSpeech: "noun",
            state: 2,
            due: new Date(snapshotNow.getTime() + (index + 1) * 60_000),
          },
        })
      ),
      ...Array.from({ length: 20 }, (_, index) =>
        db.flashcard.create({
          data: {
            deckId: firstDeck.id,
            term: `new-term-${index + 1}`,
            normalizedTerm: `new-term-${index + 1}`,
            meaningVi: `nghĩa mới ${index + 1}`,
            partOfSpeech: "noun",
            state: 0,
            due: snapshotNow,
          },
        })
      ),
    ]);

    const dueQueueBefore = await fsrsService.getReviewQueue({ newLimit: 0, now: snapshotNow });
    const beforeScheduler = await db.flashcard.findMany({
      where: { id: { in: dueCards.map((card) => card.id) } },
      select: {
        id: true,
        due: true,
        stability: true,
        difficulty: true,
        elapsedDays: true,
        scheduledDays: true,
        learningSteps: true,
        reps: true,
        lapses: true,
        state: true,
        lastReviewAt: true,
        schedulerVersion: true,
      },
      orderBy: { id: "asc" },
    });
    const reviewLogCountBefore = await db.reviewLog.count();

    const session = await globalTypingPracticeService.createDueSession(snapshotNow, () => 0);
    const questionCardIds = session.questions.map((question) => question.cardId);
    const dueCardIds = dueCards.map((card) => card.id);

    expect(session.emptyReason).toBeNull();
    expect(questionCardIds).toHaveLength(41);
    expect(new Set(questionCardIds)).toEqual(new Set(dueCardIds));
    expect(new Set(questionCardIds)).toHaveLength(41);
    expect(questionCardIds).not.toEqual(dueQueueBefore.dueCards.map((card) => card.id));
    expect(session.questions.every((question) => question.type === "typed_vi_en")).toBe(true);
    expect(session.questions.every((question) => question.mode === DUE_TYPING_MODE)).toBe(true);
    expect(session.questions.every((question) => question.correctAnswer === undefined)).toBe(true);
    expect(
      session.questions.every(
        (question) => question.type === "typed_vi_en" && typeof question.letterHint === "string"
      )
    ).toBe(true);
    expect(
      session.questions.every(
        (question) => question.type === "typed_vi_en" && question.spellingHints === undefined
      )
    ).toBe(true);

    const storedQuestions = (await db.quizSession.findUniqueOrThrow({ where: { id: session.sessionId } }))
      .questions as Array<{ id: string; correctAnswer: string }>;
    const firstQuestion = storedQuestions[0]!;
    await expect(
      globalTypingPracticeService.checkAnswer({
        sessionId: session.sessionId,
        questionId: firstQuestion.id,
        answer: `  ${firstQuestion.correctAnswer.toUpperCase()}  `,
      })
    ).resolves.toMatchObject({ correct: true });
    await expect(
      globalTypingPracticeService.checkAnswer({
        sessionId: session.sessionId,
        questionId: firstQuestion.id,
        answer: `${firstQuestion.correctAnswer}x`,
      })
    ).resolves.toMatchObject({ correct: false });

    await globalTypingPracticeService.submit({
      sessionId: session.sessionId,
      answers: storedQuestions.map((question) => ({
        questionId: question.id,
        answer: question.correctAnswer,
      })),
    });

    const [dueQueueAfter, afterScheduler, reviewLogCountAfter, attempts] = await Promise.all([
      fsrsService.getReviewQueue({ newLimit: 0, now: snapshotNow }),
      db.flashcard.findMany({
        where: { id: { in: dueCardIds } },
        select: {
          id: true,
          due: true,
          stability: true,
          difficulty: true,
          elapsedDays: true,
          scheduledDays: true,
          learningSteps: true,
          reps: true,
          lapses: true,
          state: true,
          lastReviewAt: true,
          schedulerVersion: true,
        },
        orderBy: { id: "asc" },
      }),
      db.reviewLog.count(),
      db.practiceAttempt.findMany({ where: { sessionId: session.sessionId } }),
    ]);

    expect(dueQueueAfter.totalDue).toBe(dueQueueBefore.totalDue);
    expect(afterScheduler).toEqual(beforeScheduler);
    expect(reviewLogCountAfter).toBe(reviewLogCountBefore);
    expect(attempts).toHaveLength(41);
    expect(attempts.every((attempt) => attempt.mode === DUE_TYPING_MODE)).toBe(true);
  });

  it("returns an explicit empty due state without creating a question", async () => {
    const session = await globalTypingPracticeService.createDueSession(new Date(), () => 0.5);

    expect(session).toMatchObject({
      sessionId: "",
      questions: [],
      totalEligible: 0,
      emptyReason: "no_due_cards",
    });
  });
});
