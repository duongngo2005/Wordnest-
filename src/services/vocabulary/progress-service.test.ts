import { describe, expect, it } from "vitest";
import { PracticeAttempt } from "@prisma/client";
import { buildProgressAnalytics } from "./progress-service";
import { aggregateCardPracticeEvidence } from "./practice-evidence-service";

const now = new Date("2026-09-23T10:00:00.000Z");

function attempt(partial: Partial<PracticeAttempt>): PracticeAttempt {
  return {
    id: "attempt",
    flashcardId: "card-1",
    sessionId: "session-1",
    questionId: null,
    prompt: null,
    attemptNumber: 1,
    mode: "quiz",
    questionType: "typed_vi_en",
    correct: false,
    answer: "",
    expectedAnswer: "allocate",
    responseMs: null,
    createdAt: now,
    ...partial,
  };
}

function evidenceMap(attempts: PracticeAttempt[]) {
  const byCard = new Map<string, PracticeAttempt[]>();
  for (const practiceAttempt of attempts) {
    const cardAttempts = byCard.get(practiceAttempt.flashcardId) ?? [];
    cardAttempts.push(practiceAttempt);
    byCard.set(practiceAttempt.flashcardId, cardAttempts);
  }
  return new Map(
    [...byCard.entries()].map(([flashcardId, cardAttempts]) => [
      flashcardId,
      aggregateCardPracticeEvidence(flashcardId, cardAttempts),
    ])
  );
}

function analyticsForPracticeAttempts(practiceAttempts: PracticeAttempt[]) {
  return buildProgressAnalytics({
    scope: { kind: "deck", id: "deck-1", name: "Day 1" },
    decks: [
      {
        id: "deck-1",
        name: "Day 1",
        folderId: null,
        folderName: null,
        cards: [
          {
            id: "card-1",
            deckId: "deck-1",
            term: "allocate",
            normalizedTerm: "allocate",
            meaningVi: "phân bổ",
            state: 0,
            due: now,
          },
        ],
      },
    ],
    reviewLogs: [],
    practiceEvidence: evidenceMap(practiceAttempts),
    quizAttempts: [],
    now,
  });
}

describe("buildProgressAnalytics", () => {
  it("reports observed states, activity, first-pass results, and weak evidence without a mastery score", () => {
    const analytics = buildProgressAnalytics({
      scope: { kind: "global", name: "Tất cả bộ từ" },
      decks: [
        {
          id: "deck-1",
          name: "Day 1",
          folderId: "folder-1",
          folderName: "TOEIC",
          cards: [
            {
              id: "card-1",
              deckId: "deck-1",
              term: "allocate",
              normalizedTerm: "allocate",
              meaningVi: "phân bổ",
              state: 2,
              due: new Date("2026-09-23T08:00:00.000Z"),
            },
            {
              id: "card-2",
              deckId: "deck-1",
              term: "resilient",
              normalizedTerm: "resilient",
              meaningVi: "kiên cường",
              state: 0,
              due: now,
            },
          ],
        },
      ],
      reviewLogs: [
        { cardId: "card-1", rating: 3, review: new Date("2026-09-23T09:00:00.000Z") },
      ],
      practiceEvidence: evidenceMap([
        attempt({ id: "attempt-1", correct: false, createdAt: new Date("2026-09-22T10:00:00.000Z") }),
        attempt({ id: "attempt-2", correct: false, createdAt: now }),
        attempt({ id: "retry", attemptNumber: 2, correct: true, createdAt: now }),
      ]),
      quizAttempts: [{ deckId: "deck-1" }],
      now,
    });

    expect(analytics.today).toMatchObject({ due: 1, reviewedCards: 1, reviewEvents: 1, totalCards: 2, weakCards: 1 });
    expect(analytics.states.map((state) => [state.key, state.count])).toContainEqual(["review", 1]);
    expect(analytics.practice.firstPass).toMatchObject({ total: 2, correct: 0, accuracy: 0 });
    expect(analytics.practice.retry).toMatchObject({ total: 1, correct: 1, accuracy: 100 });
    expect(analytics.practice).toMatchObject({ assessedCards: 1, hasSufficientEvidence: true });
    expect(analytics.reviewRatings.find((rating) => rating.rating === 3)?.count).toBe(1);
    expect(analytics.weakCards[0]).toMatchObject({ term: "allocate", deckName: "Day 1" });
    expect("mastery" in analytics).toBe(false);
    expect(analytics.reviewActivity.metrics.currentStreak).toBe(1);
    expect(analytics.reviewActivity.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(analytics.reviewActivity.weeks).toHaveLength(52);
  });

  it("keeps an empty analytics scope factual rather than manufacturing percentages", () => {
    const analytics = buildProgressAnalytics({
      scope: { kind: "deck", id: "empty", name: "Trống" },
      decks: [],
      reviewLogs: [],
      practiceEvidence: new Map(),
      quizAttempts: [],
      now,
    });

    expect(analytics.today).toMatchObject({ due: 0, reviewedCards: 0, reviewEvents: 0, totalCards: 0, weakCards: 0 });
    expect(analytics.practice.firstPass.accuracy).toBeNull();
    expect(analytics.practice).toMatchObject({ assessedCards: 0, hasSufficientEvidence: false });
    expect(analytics.practice.byType).toEqual([]);
    expect(analytics.activity.every((day) => day.count === 0)).toBe(true);
    expect(analytics.reviewActivity.metrics.currentStreak).toBe(0);
    expect(analytics.reviewActivity.metrics.longestStreak).toBe(0);
    expect(analytics.reviewActivity.metrics.activeDaysInPeriod).toBe(0);
  });

  it("separates overdue work from upcoming work and counts reviewed cards uniquely", () => {
    const analytics = buildProgressAnalytics({
      scope: { kind: "deck", id: "deck-1", name: "Day 1" },
      decks: [
        {
          id: "deck-1",
          name: "Day 1",
          folderId: null,
          folderName: null,
          cards: [
            { id: "overdue", deckId: "deck-1", term: "overdue", normalizedTerm: "overdue", meaningVi: "quá hạn", state: 1, due: new Date("2026-09-22T10:00:00.000Z") },
            { id: "today", deckId: "deck-1", term: "today", normalizedTerm: "today", meaningVi: "hôm nay", state: 1, due: new Date("2026-09-23T15:00:00.000Z") },
            { id: "future", deckId: "deck-1", term: "future", normalizedTerm: "future", meaningVi: "tương lai", state: 2, due: new Date("2026-09-24T10:00:00.000Z") },
          ],
        },
      ],
      reviewLogs: [
        { cardId: "overdue", rating: 1, review: new Date("2026-09-23T08:00:00.000Z") },
        { cardId: "overdue", rating: 2, review: new Date("2026-09-23T09:00:00.000Z") },
      ],
      practiceEvidence: evidenceMap([attempt({ flashcardId: "overdue", id: "single-attempt" })]),
      quizAttempts: [],
      now,
    });

    expect(analytics.today).toMatchObject({ due: 1, overdue: 1, reviewedCards: 1, reviewEvents: 2, weakCards: 0 });
    expect(analytics.practice).toMatchObject({ assessedCards: 0, hasSufficientEvidence: false });
    expect(analytics.upcomingDue).toHaveLength(7);
    expect(analytics.upcomingDue[0]).toMatchObject({ date: "2026-09-23", count: 1 });
    expect(analytics.upcomingDue[1]).toMatchObject({ date: "2026-09-24", count: 1 });
    expect(analytics.upcomingDue.every((day) => day.date !== "2026-09-22")).toBe(true);
  });

  it("reports recognition and production lifetime first-pass accuracy independently", () => {
    const recognitionAttempts = Array.from({ length: 10 }, (_, index) =>
      attempt({
        id: `recognition-${index}`,
        questionType: "multiple_choice_en_vi",
        correct: index < 8,
        createdAt: new Date(`2026-09-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`),
      })
    );
    const productionFirstPass = attempt({
      id: "production-first-pass",
      questionType: "typed_vi_en",
      correct: false,
      createdAt: new Date("2026-09-22T10:00:00.000Z"),
    });
    const productionRetry = attempt({
      id: "production-retry",
      questionType: "typed_vi_en",
      attemptNumber: 2,
      correct: true,
      createdAt: new Date("2026-09-22T10:01:00.000Z"),
    });
    const practiceEvidence = new Map([
      [
        "card-1",
        aggregateCardPracticeEvidence("card-1", [
          ...recognitionAttempts,
          productionFirstPass,
          productionRetry,
        ]),
      ],
    ]);

    const analytics = buildProgressAnalytics({
      scope: { kind: "deck", id: "deck-1", name: "Day 1" },
      decks: [
        {
          id: "deck-1",
          name: "Day 1",
          folderId: null,
          folderName: null,
          cards: [
            {
              id: "card-1",
              deckId: "deck-1",
              term: "allocate",
              normalizedTerm: "allocate",
              meaningVi: "phân bổ",
              state: 0,
              due: now,
            },
          ],
        },
      ],
      reviewLogs: [],
      practiceEvidence,
      quizAttempts: [],
      now,
    });

    expect(analytics.practice).toMatchObject({
      recognition: { total: 10, correct: 8, accuracy: 80 },
      production: { total: 1, correct: 0, accuracy: 0 },
    });
  });

  it("keeps a recognition-only result separate from missing production evidence", () => {
    const analytics = analyticsForPracticeAttempts(
      Array.from({ length: 10 }, (_, index) =>
        attempt({
          id: `recognition-only-${index}`,
          questionType: "fill_in_blank",
          correct: index < 8,
          createdAt: new Date(now.getTime() + index),
        })
      )
    );

    expect(analytics.practice.recognition).toMatchObject({ total: 10, correct: 8, accuracy: 80 });
    expect(analytics.practice.production).toMatchObject({ total: 0, correct: 0, accuracy: null });
  });

  it("keeps a production-only result separate from missing recognition evidence", () => {
    const analytics = analyticsForPracticeAttempts(
      Array.from({ length: 5 }, (_, index) =>
        attempt({
          id: `production-only-${index}`,
          questionType: "typed_vi_en",
          correct: index < 3,
          createdAt: new Date(now.getTime() + index),
        })
      )
    );

    expect(analytics.practice.recognition.accuracy).toBeNull();
    expect(analytics.practice.production).toMatchObject({ total: 5, correct: 3, accuracy: 60 });
  });

  it("keeps both lifetime denominators independent when their accuracies diverge", () => {
    const recognition = Array.from({ length: 10 }, (_, index) =>
      attempt({
        id: `both-recognition-${index}`,
        questionType: "multiple_choice_vi_en",
        correct: index < 9,
        createdAt: new Date(now.getTime() + index),
      })
    );
    const production = Array.from({ length: 5 }, (_, index) =>
      attempt({
        id: `both-production-${index}`,
        questionType: "typed_vi_en",
        correct: index < 2,
        createdAt: new Date(now.getTime() + 100 + index),
      })
    );

    const analytics = analyticsForPracticeAttempts([...recognition, ...production]);

    expect(analytics.practice.recognition).toMatchObject({ total: 10, correct: 9, accuracy: 90 });
    expect(analytics.practice.production).toMatchObject({ total: 5, correct: 2, accuracy: 40 });
    expect(analytics.practice.firstPass).toMatchObject({ total: 15, correct: 11, accuracy: 73.3 });
  });

  it("preserves the legacy overall denominator across all first-pass question types", () => {
    const analytics = analyticsForPracticeAttempts([
      attempt({ id: "story-vocabulary", questionType: "story_contextual_vocab", correct: true }),
      attempt({ id: "story-cloze", questionType: "story_cloze", correct: false }),
      attempt({ id: "story-comprehension", questionType: "story_comprehension", correct: true }),
      attempt({ id: "legacy-other", questionType: "legacy_non_vocab", correct: false }),
      attempt({ id: "production-retry", questionType: "typed_vi_en", attemptNumber: 2, correct: true }),
    ]);

    expect(analytics.practice.recognition).toMatchObject({ total: 1, correct: 1, accuracy: 100 });
    expect(analytics.practice.production).toMatchObject({ total: 1, correct: 0, accuracy: 0 });
    expect(analytics.practice.firstPass).toMatchObject({ total: 4, correct: 2, accuracy: 50 });
    expect(analytics.practice.retry).toMatchObject({ total: 1, correct: 1, accuracy: 100 });
  });

  it("marks a one-attempt axis as insufficient without changing its mathematical accuracy", () => {
    const analytics = analyticsForPracticeAttempts([
      attempt({ id: "single-recognition", questionType: "multiple_choice", correct: true }),
    ]);

    expect(analytics.practice.recognition).toMatchObject({
      total: 1,
      correct: 1,
      accuracy: 100,
      hasSufficientEvidence: false,
    });
  });

  it("does not let high lifetime accuracy replace a recent weak-axis signal", () => {
    const analytics = analyticsForPracticeAttempts(
      Array.from({ length: 100 }, (_, index) =>
        attempt({
          id: `lifetime-${index}`,
          questionType: "multiple_choice_en_vi",
          correct: index < 90,
          createdAt: new Date(now.getTime() + index),
        })
      )
    );

    expect(analytics.practice.recognition).toMatchObject({ total: 100, correct: 90, accuracy: 90 });
    expect(analytics.today.weakCards).toBe(1);
  });
});
