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

    expect(analytics.today).toMatchObject({ due: 1, reviewed: 1, totalCards: 2, weakCards: 1 });
    expect(analytics.states.map((state) => [state.key, state.count])).toContainEqual(["review", 1]);
    expect(analytics.practice.firstPass).toMatchObject({ total: 2, correct: 0, accuracy: 0 });
    expect(analytics.practice.retry).toMatchObject({ total: 1, correct: 1, accuracy: 100 });
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

    expect(analytics.today).toMatchObject({ due: 0, reviewed: 0, totalCards: 0, weakCards: 0 });
    expect(analytics.practice.firstPass.accuracy).toBeNull();
    expect(analytics.practice.byType).toEqual([]);
    expect(analytics.activity.every((day) => day.count === 0)).toBe(true);
  });
});
