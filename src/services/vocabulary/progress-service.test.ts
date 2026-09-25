import { describe, expect, it } from "vitest";
import { PracticeAttempt } from "@prisma/client";
import { buildProgressAnalytics } from "./progress-service";

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
      practiceAttempts: [
        attempt({ id: "attempt-1", correct: false, createdAt: new Date("2026-09-22T10:00:00.000Z") }),
        attempt({ id: "attempt-2", correct: false, createdAt: now }),
        attempt({ id: "retry", attemptNumber: 2, correct: true, createdAt: now }),
      ],
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
  });

  it("keeps an empty analytics scope factual rather than manufacturing percentages", () => {
    const analytics = buildProgressAnalytics({
      scope: { kind: "deck", id: "empty", name: "Trống" },
      decks: [],
      reviewLogs: [],
      practiceAttempts: [],
      quizAttempts: [],
      now,
    });

    expect(analytics.today).toMatchObject({ due: 0, reviewedCards: 0, reviewEvents: 0, totalCards: 0, weakCards: 0 });
    expect(analytics.practice.firstPass.accuracy).toBeNull();
    expect(analytics.practice).toMatchObject({ assessedCards: 0, hasSufficientEvidence: false });
    expect(analytics.practice.byType).toEqual([]);
    expect(analytics.activity.every((day) => day.count === 0)).toBe(true);
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
      practiceAttempts: [attempt({ flashcardId: "overdue", id: "single-attempt" })],
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
});
