/**
 * Deterministic selection policy shared by Story and Lesson setup flows.
 * This module deliberately knows nothing about Practice Evidence classification:
 * callers provide the already-confirmed, ordered weak-card IDs.
 */

export const CONTEXTUAL_GENERAL_TARGET_COUNT = 5;
export const LESSON_CONTEXTUAL_TARGET_LIMIT = 20;
export const CONTEXTUAL_TARGET_VISIBLE_RESULT_LIMIT = 100;

export type ContextualTargetIntent = "general" | "weak" | "manual";

export type ContextualTargetSelectionInput = {
  intent: ContextualTargetIntent;
  deckCardIds: readonly string[];
  weakCardIds?: readonly string[];
  manualIds?: readonly string[];
  maxSelectedIds?: number;
};

export type ContextualTargetSelectionResult = {
  selectedIds: string[];
  ignoredUnknownIds: string[];
  duplicateCount: number;
  overflowCount: number;
};

function normalizeLimit(maxSelectedIds: number | undefined): number | undefined {
  if (maxSelectedIds === undefined) return undefined;
  return Math.max(0, Math.floor(maxSelectedIds));
}

/**
 * Keeps only deck-owned IDs, preserving the first caller-provided occurrence.
 * A maximum is presentation/content-type policy, not evidence eligibility.
 */
export function normalizeContextualTargetIds({
  candidateIds,
  deckCardIds,
  maxSelectedIds,
}: {
  candidateIds: readonly string[];
  deckCardIds: readonly string[];
  maxSelectedIds?: number;
}): ContextualTargetSelectionResult {
  const availableIds = new Set(deckCardIds);
  const seenIds = new Set<string>();
  const validIds: string[] = [];
  const ignoredUnknownIds: string[] = [];
  let duplicateCount = 0;

  for (const id of candidateIds) {
    if (!availableIds.has(id)) {
      ignoredUnknownIds.push(id);
      continue;
    }
    if (seenIds.has(id)) {
      duplicateCount += 1;
      continue;
    }
    seenIds.add(id);
    validIds.push(id);
  }

  const limit = normalizeLimit(maxSelectedIds);
  const selectedIds = limit === undefined ? validIds : validIds.slice(0, limit);

  return {
    selectedIds,
    ignoredUnknownIds,
    duplicateCount,
    overflowCount: validIds.length - selectedIds.length,
  };
}

export function resolveContextualTargetSelection({
  intent,
  deckCardIds,
  weakCardIds = [],
  manualIds = [],
  maxSelectedIds,
}: ContextualTargetSelectionInput): ContextualTargetSelectionResult {
  const candidateIds =
    intent === "general"
      ? deckCardIds.slice(0, CONTEXTUAL_GENERAL_TARGET_COUNT)
      : intent === "weak"
      ? weakCardIds
      : manualIds;

  return normalizeContextualTargetIds({ candidateIds, deckCardIds, maxSelectedIds });
}

/**
 * Updates a manual selection without allowing a caller to create an invalid
 * Lesson selection while the modal is open. Story passes no max and remains
 * intentionally uncapped at the product-contract level.
 */
export function toggleContextualTargetId({
  selectedIds,
  targetId,
  deckCardIds,
  maxSelectedIds,
}: {
  selectedIds: readonly string[];
  targetId: string;
  deckCardIds: readonly string[];
  maxSelectedIds?: number;
}): ContextualTargetSelectionResult & { limitReached: boolean } {
  const normalizedCurrent = normalizeContextualTargetIds({
    candidateIds: selectedIds,
    deckCardIds,
    maxSelectedIds,
  });

  if (!deckCardIds.includes(targetId)) {
    return { ...normalizedCurrent, limitReached: false };
  }

  if (normalizedCurrent.selectedIds.includes(targetId)) {
    return {
      ...normalizeContextualTargetIds({
        candidateIds: normalizedCurrent.selectedIds.filter((id) => id !== targetId),
        deckCardIds,
        maxSelectedIds,
      }),
      limitReached: false,
    };
  }

  const limit = normalizeLimit(maxSelectedIds);
  if (limit !== undefined && normalizedCurrent.selectedIds.length >= limit) {
    return { ...normalizedCurrent, limitReached: true };
  }

  return {
    ...normalizeContextualTargetIds({
      candidateIds: [...normalizedCurrent.selectedIds, targetId],
      deckCardIds,
      maxSelectedIds,
    }),
    limitReached: false,
  };
}

/** Converts Story UI IDs to its existing, term-backed request payload in selection order. */
export function resolveStoryTargetTerms(
  deckWords: ReadonlyArray<{ id: string; term: string }>,
  selectedIds: readonly string[]
): string[] {
  const termById = new Map(deckWords.map((word) => [word.id, word.term]));
  return selectedIds.flatMap((id) => {
    const term = termById.get(id);
    return term ? [term] : [];
  });
}
