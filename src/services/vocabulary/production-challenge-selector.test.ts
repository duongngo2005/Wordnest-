import { describe, expect, it } from "vitest";
import {
  PRODUCTION_CHALLENGE_DEFAULT_COUNT,
  selectProductionChallengeCardIds,
  type ProductionChallengeCard,
  type TypedChallengeEvidence,
} from "./production-challenge-selector";

const now = new Date("2026-10-08T10:00:00.000Z");

function card(index: number, overrides: Partial<ProductionChallengeCard> = {}): ProductionChallengeCard {
  return {
    id: `card-${index}`,
    meaningVi: `nghĩa ${index}`,
    normalizedTerm: `term-${index}`,
    createdAt: new Date(`2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
    ...overrides,
  };
}

function evidence(overrides: Partial<TypedChallengeEvidence> = {}): TypedChallengeEvidence {
  return {
    state: "NO_EVIDENCE",
    lifetimeFirstPassAttempts: 0,
    lifetimeFirstPassCorrect: 0,
    lifetimeFirstPassIncorrect: 0,
    recentIncorrectCount: 0,
    latestFirstPassCorrect: null,
    lastFirstPassAt: null,
    lastFirstPassIncorrectAt: null,
    latestFirstPassMatchingRetryCorrect: null,
    ...overrides,
  };
}

describe("selectProductionChallengeCardIds", () => {
  it("uses the 16 / 8 / 1 lanes for a normal 25-card session", () => {
    const remediationCards = Array.from({ length: 20 }, (_, index) => card(index + 1));
    const coverageCards = Array.from({ length: 40 }, (_, index) => card(index + 101));
    const strongCards = Array.from({ length: 60 }, (_, index) => card(index + 201));
    const cards = [...remediationCards, ...coverageCards, ...strongCards];
    const typedEvidence = new Map<string, TypedChallengeEvidence>();

    for (const item of remediationCards) {
      typedEvidence.set(
        item.id,
        evidence({
          state: "NEEDS_PRACTICE",
          lifetimeFirstPassAttempts: 4,
          lifetimeFirstPassIncorrect: 4,
          recentIncorrectCount: 4,
          latestFirstPassCorrect: false,
          lastFirstPassAt: new Date("2026-10-08T09:00:00.000Z"),
          latestFirstPassMatchingRetryCorrect: false,
        })
      );
    }

    for (const item of strongCards) {
      typedEvidence.set(
        item.id,
        evidence({
          state: "STRONG",
          lifetimeFirstPassAttempts: 8,
          lifetimeFirstPassCorrect: 8,
          lastFirstPassAt: new Date("2026-09-01T10:00:00.000Z"),
          latestFirstPassCorrect: true,
        })
      );
    }

    const selected = selectProductionChallengeCardIds(cards, typedEvidence, now);

    expect(selected).toHaveLength(PRODUCTION_CHALLENGE_DEFAULT_COUNT);
    expect(new Set(selected)).toHaveLength(PRODUCTION_CHALLENGE_DEFAULT_COUNT);
    expect(selected.filter((id) => remediationCards.some((item) => item.id === id))).toHaveLength(16);
    expect(selected.filter((id) => coverageCards.some((item) => item.id === id))).toHaveLength(8);
    expect(selected.filter((id) => strongCards.some((item) => item.id === id))).toHaveLength(1);
  });

  it("prioritizes repeated typed failures over recently strong typed cards", () => {
    const failed = card(1);
    const strong = card(2);
    const typedEvidence = new Map<string, TypedChallengeEvidence>([
      [
        failed.id,
        evidence({
          state: "NEEDS_PRACTICE",
          lifetimeFirstPassAttempts: 4,
          lifetimeFirstPassIncorrect: 4,
          recentIncorrectCount: 4,
          latestFirstPassCorrect: false,
          lastFirstPassAt: new Date("2026-10-08T09:00:00.000Z"),
          latestFirstPassMatchingRetryCorrect: false,
        }),
      ],
      [
        strong.id,
        evidence({
          state: "STRONG",
          lifetimeFirstPassAttempts: 8,
          lifetimeFirstPassCorrect: 8,
          latestFirstPassCorrect: true,
          lastFirstPassAt: new Date("2026-10-08T09:55:00.000Z"),
        }),
      ],
    ]);

    expect(selectProductionChallengeCardIds([failed, strong], typedEvidence, now, 1)).toEqual([failed.id]);
  });

  it("orders remediation by retry outcome, then typed state, then recent failures", () => {
    const retryWrong = card(1);
    const retryCorrect = card(2);
    const needsPractice = card(3);
    const mixed = card(4);
    const typedEvidence = new Map<string, TypedChallengeEvidence>([
      [
        retryWrong.id,
        evidence({
          state: "NEEDS_PRACTICE",
          lifetimeFirstPassAttempts: 3,
          lifetimeFirstPassIncorrect: 3,
          recentIncorrectCount: 3,
          latestFirstPassCorrect: false,
          lastFirstPassAt: new Date("2026-10-08T09:00:00.000Z"),
          lastFirstPassIncorrectAt: new Date("2026-10-08T09:00:00.000Z"),
          latestFirstPassMatchingRetryCorrect: false,
        }),
      ],
      [
        retryCorrect.id,
        evidence({
          state: "NEEDS_PRACTICE",
          lifetimeFirstPassAttempts: 3,
          lifetimeFirstPassIncorrect: 3,
          recentIncorrectCount: 3,
          latestFirstPassCorrect: false,
          lastFirstPassAt: new Date("2026-10-08T09:01:00.000Z"),
          lastFirstPassIncorrectAt: new Date("2026-10-08T09:01:00.000Z"),
          latestFirstPassMatchingRetryCorrect: true,
        }),
      ],
      [
        needsPractice.id,
        evidence({
          state: "NEEDS_PRACTICE",
          lifetimeFirstPassAttempts: 4,
          lifetimeFirstPassIncorrect: 3,
          recentIncorrectCount: 3,
          latestFirstPassCorrect: true,
          lastFirstPassAt: new Date("2026-10-08T09:02:00.000Z"),
          lastFirstPassIncorrectAt: new Date("2026-10-08T09:01:30.000Z"),
        }),
      ],
      [
        mixed.id,
        evidence({
          state: "MIXED",
          lifetimeFirstPassAttempts: 4,
          lifetimeFirstPassIncorrect: 2,
          recentIncorrectCount: 2,
          latestFirstPassCorrect: true,
          lastFirstPassAt: new Date("2026-10-08T09:03:00.000Z"),
          lastFirstPassIncorrectAt: new Date("2026-10-08T09:02:30.000Z"),
        }),
      ],
    ]);

    expect(selectProductionChallengeCardIds(
      [retryWrong, retryCorrect, needsPractice, mixed],
      typedEvidence,
      now,
      4
    )).toEqual([retryWrong.id, retryCorrect.id, needsPractice.id, mixed.id]);
  });

  it("gives direct typed coverage to cards with no typed evidence regardless of recognition history", () => {
    const neverTyped = card(1);
    const typedStrong = card(2);
    const typedEvidence = new Map<string, TypedChallengeEvidence>([
      [
        typedStrong.id,
        evidence({
          state: "STRONG",
          lifetimeFirstPassAttempts: 5,
          lifetimeFirstPassCorrect: 5,
          latestFirstPassCorrect: true,
          lastFirstPassAt: new Date("2026-10-08T09:55:00.000Z"),
        }),
      ],
    ]);

    expect(selectProductionChallengeCardIds([neverTyped, typedStrong], typedEvidence, now, 1)).toEqual([
      neverTyped.id,
    ]);
  });

  it("returns an old typed-strong card through maintenance while excluding a recently typed strong card", () => {
    const oldStrong = card(1);
    const recentStrong = card(2);
    const typedEvidence = new Map<string, TypedChallengeEvidence>([
      [
        oldStrong.id,
        evidence({
          state: "STRONG",
          lifetimeFirstPassAttempts: 10,
          lifetimeFirstPassCorrect: 10,
          latestFirstPassCorrect: true,
          lastFirstPassAt: new Date("2026-09-08T10:00:00.000Z"),
        }),
      ],
      [
        recentStrong.id,
        evidence({
          state: "STRONG",
          lifetimeFirstPassAttempts: 10,
          lifetimeFirstPassCorrect: 10,
          latestFirstPassCorrect: true,
          lastFirstPassAt: new Date("2026-10-08T09:55:00.000Z"),
        }),
      ],
    ]);

    expect(selectProductionChallengeCardIds([oldStrong, recentStrong], typedEvidence, now, 1)).toEqual([
      oldStrong.id,
    ]);
  });

  it("falls back to typed-strong cards for a small all-strong deck", () => {
    const cards = Array.from({ length: 7 }, (_, index) => card(index + 1));
    const typedEvidence = new Map(
      cards.map((item) => [
        item.id,
        evidence({
          state: "STRONG",
          lifetimeFirstPassAttempts: 4,
          lifetimeFirstPassCorrect: 4,
          latestFirstPassCorrect: true,
          lastFirstPassAt: new Date("2026-10-07T10:00:00.000Z"),
        }),
      ])
    );

    expect(selectProductionChallengeCardIds(cards, typedEvidence, now)).toEqual(cards.map((item) => item.id));
  });

  it("excludes cards without a usable Vietnamese cue and never duplicates short decks", () => {
    const eligibleCards = Array.from({ length: 8 }, (_, index) => card(index + 1));
    const noCue = card(99, { meaningVi: "   " });

    const selected = selectProductionChallengeCardIds([...eligibleCards, noCue], new Map(), now);

    expect(selected).toHaveLength(8);
    expect(selected).not.toContain(noCue.id);
    expect(new Set(selected)).toHaveLength(8);
  });
});
