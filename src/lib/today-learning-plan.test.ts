import { describe, expect, it } from "vitest";
import {
  composeTodayLearningPlan,
  getBoundedTodayDeckContext,
  getTodayLearningPlanHref,
  TodayDeckState,
} from "./today-learning-plan";

function deck(id: string, overrides: Partial<TodayDeckState> = {}): TodayDeckState {
  return {
    deckId: id,
    deckName: `Deck ${id}`,
    stableOrder: 0,
    totalCards: 10,
    dueCount: 0,
    weakCount: 0,
    newCount: 0,
    ...overrides,
  };
}

describe("composeTodayLearningPlan", () => {
  it("keeps the no-deck onboarding state factual", () => {
    expect(composeTodayLearningPlan([])).toEqual({ kind: "NO_DECKS" });
  });

  it("sends an account with only empty decks to its first stable deck", () => {
    const plan = composeTodayLearningPlan([deck("a", { totalCards: 0 }), deck("b", { totalCards: 0 })]);
    expect(plan).toMatchObject({ kind: "EMPTY", deck: { deckId: "a" } });
    expect(getTodayLearningPlanHref(plan)).toBe("/decks/a");
  });

  it("aggregates due-now cards and gives global review absolute priority", () => {
    const plan = composeTodayLearningPlan([
      deck("a", { dueCount: 12, weakCount: 2, newCount: 3 }),
      deck("b", { dueCount: 20 }),
      deck("c", { dueCount: 8 }),
    ]);

    expect(plan).toEqual({ kind: "DUE", dueCount: 40, dueDeckCount: 3 });
    expect(getTodayLearningPlanHref(plan)).toBe("/review");
  });

  it("chooses confirmed weakness before new cards in the first eligible deck", () => {
    const plan = composeTodayLearningPlan([
      deck("a"),
      deck("b", { weakCount: 12 }),
      deck("c", { newCount: 10 }),
    ]);

    expect(plan).toMatchObject({ kind: "WEAK", deck: { deckId: "b" } });
    expect(getTodayLearningPlanHref(plan)).toBe("/decks/b/quiz?mode=focused_practice");
  });

  it("uses stable input order rather than weak-card count to break weak ties", () => {
    const plan = composeTodayLearningPlan([
      deck("a", { weakCount: 3 }),
      deck("b", { weakCount: 20 }),
    ]);

    expect(plan).toMatchObject({ kind: "WEAK", deck: { deckId: "a" } });
  });

  it("uses stable input order rather than new-card count to break new ties", () => {
    const plan = composeTodayLearningPlan([
      deck("a", { newCount: 5 }),
      deck("b", { newCount: 30 }),
    ]);

    expect(plan).toMatchObject({ kind: "NEW", deck: { deckId: "a" } });
    expect(getTodayLearningPlanHref(plan)).toBe("/decks/a/study");
  });

  it("prefers a non-empty caught-up deck over an unrelated empty deck", () => {
    const plan = composeTodayLearningPlan([
      deck("empty", { totalCards: 0 }),
      deck("caught-up", { totalCards: 8 }),
    ]);

    expect(plan).toMatchObject({ kind: "CONTEXT", deck: { deckId: "caught-up" } });
    expect(getTodayLearningPlanHref(plan)).toBe("/decks/caught-up");
  });

  it("keeps deterministic output for equivalent ordered input", () => {
    const input = [deck("a", { weakCount: 2 }), deck("b", { newCount: 4 })];
    expect(composeTodayLearningPlan(input)).toEqual(composeTodayLearningPlan([...input]));
  });
});

describe("getBoundedTodayDeckContext", () => {
  it("bounds secondary context without changing the primary decision", () => {
    const decks = Array.from({ length: 10 }, (_, index) => deck(`deck-${index}`, { dueCount: 1 }));
    const plan = composeTodayLearningPlan(decks);
    const context = getBoundedTodayDeckContext(decks, plan, 3);

    expect(plan).toMatchObject({ kind: "DUE", dueCount: 10, dueDeckCount: 10 });
    expect(context.items).toHaveLength(3);
    expect(context.remainingCount).toBe(7);
    expect(context.items.map((item) => item.deck.deckId)).toEqual(["deck-0", "deck-1", "deck-2"]);
  });
});
