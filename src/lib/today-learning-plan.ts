/**
 * Read-time learning states used by Home's "Hôm nay" recommendation.
 *
 * `decks` must already be in the stable order shown by Home. The composer
 * deliberately never ranks or sorts decks: same-category ties belong to that
 * existing user-visible order, not a second urgency system.
 */
export interface TodayDeckState {
  deckId: string;
  deckName: string;
  stableOrder: number;
  totalCards: number;
  dueCount: number;
  weakCount: number;
  newCount: number;
}

export type TodayDeckStatus = "DUE" | "WEAK" | "NEW" | "CONTEXT" | "EMPTY";

export type TodayLearningPlan =
  | {
      kind: "DUE";
      dueCount: number;
      dueDeckCount: number;
    }
  | {
      kind: "WEAK" | "NEW" | "CONTEXT" | "EMPTY";
      deck: TodayDeckState;
    }
  | {
      kind: "NO_DECKS";
    };

export interface TodaySecondaryDeckContext {
  deck: TodayDeckState;
  status: TodayDeckStatus;
}

export interface BoundedTodayDeckContext {
  items: TodaySecondaryDeckContext[];
  remainingCount: number;
}

function count(value: number): number {
  return Math.max(0, value);
}

/**
 * Returns the same per-deck state order used by the deck hero, without making
 * a cross-deck priority score. Global due handling happens in the composer.
 */
export function getTodayDeckStatus(deck: TodayDeckState): TodayDeckStatus {
  if (count(deck.totalCards) === 0) return "EMPTY";
  if (count(deck.dueCount) > 0) return "DUE";
  if (count(deck.weakCount) > 0) return "WEAK";
  if (count(deck.newCount) > 0) return "NEW";
  return "CONTEXT";
}

/**
 * Deterministically chooses one next action for Home.
 *
 * Priority is intentionally fixed: due now -> confirmed weakness -> new
 * cards -> contextual learning -> empty deck. The input order resolves every
 * same-category tie.
 */
export function composeTodayLearningPlan(decks: TodayDeckState[]): TodayLearningPlan {
  if (decks.length === 0) return { kind: "NO_DECKS" };

  const dueCount = decks.reduce((total, deck) => total + count(deck.dueCount), 0);
  if (dueCount > 0) {
    return {
      kind: "DUE",
      dueCount,
      dueDeckCount: decks.filter((deck) => count(deck.dueCount) > 0).length,
    };
  }

  const weakDeck = decks.find((deck) => count(deck.weakCount) > 0);
  if (weakDeck) return { kind: "WEAK", deck: weakDeck };

  const newDeck = decks.find((deck) => count(deck.newCount) > 0);
  if (newDeck) return { kind: "NEW", deck: newDeck };

  const contextualDeck = decks.find((deck) => count(deck.totalCards) > 0);
  if (contextualDeck) return { kind: "CONTEXT", deck: contextualDeck };

  return { kind: "EMPTY", deck: decks[0] };
}

export function getTodayLearningPlanHref(plan: TodayLearningPlan): string | null {
  switch (plan.kind) {
    case "DUE":
      return "/review";
    case "WEAK":
      return `/decks/${plan.deck.deckId}/quiz?mode=focused_practice`;
    case "NEW":
      return `/decks/${plan.deck.deckId}/study`;
    case "CONTEXT":
    case "EMPTY":
      return `/decks/${plan.deck.deckId}`;
    case "NO_DECKS":
      return null;
  }
}

/**
 * A bounded, informational deck breakdown for the postcard. It reuses the
 * local state helper above and never creates a second action-ranking model.
 */
export function getBoundedTodayDeckContext(
  decks: TodayDeckState[],
  plan: TodayLearningPlan,
  limit = 3
): BoundedTodayDeckContext {
  const primaryDeckId = plan.kind === "DUE" || plan.kind === "NO_DECKS" ? null : plan.deck.deckId;
  const candidates =
    plan.kind === "DUE"
      ? decks.filter((deck) => count(deck.dueCount) > 0)
      : decks.filter((deck) => deck.deckId !== primaryDeckId);
  const bounded = candidates.slice(0, Math.max(0, limit));

  return {
    items: bounded.map((deck) => ({ deck, status: getTodayDeckStatus(deck) })),
    remainingCount: Math.max(0, candidates.length - bounded.length),
  };
}
