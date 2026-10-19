import type { AxisEvidenceState } from "./practice-evidence-service";

export const PRODUCTION_CHALLENGE_DEFAULT_COUNT = 25;
export const PRODUCTION_CHALLENGE_REMEDIATION_LIMIT = 16;
export const PRODUCTION_CHALLENGE_COVERAGE_LIMIT = 8;
export const PRODUCTION_CHALLENGE_MAINTENANCE_LIMIT = 1;
export const PRODUCTION_CHALLENGE_MAINTENANCE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export interface ProductionChallengeCard {
  id: string;
  meaningVi: string;
  normalizedTerm: string;
  createdAt: Date;
}

/**
 * An ephemeral view of direct Vietnamese-to-English recall only.
 * It deliberately excludes story_cloze and recognition evidence.
 */
export interface TypedChallengeEvidence {
  state: AxisEvidenceState;
  lifetimeFirstPassAttempts: number;
  lifetimeFirstPassCorrect: number;
  lifetimeFirstPassIncorrect: number;
  recentIncorrectCount: number;
  latestFirstPassCorrect: boolean | null;
  lastFirstPassAt: Date | null;
  /** Latest failure in the bounded typed first-pass window, if any. */
  lastFirstPassIncorrectAt: Date | null;
  latestFirstPassMatchingRetryCorrect: boolean | null;
}

interface IndexedCandidate {
  card: ProductionChallengeCard;
  evidence: TypedChallengeEvidence;
  stableIndex: number;
}

const NO_TYPED_EVIDENCE: TypedChallengeEvidence = {
  state: "NO_EVIDENCE",
  lifetimeFirstPassAttempts: 0,
  lifetimeFirstPassCorrect: 0,
  lifetimeFirstPassIncorrect: 0,
  recentIncorrectCount: 0,
  latestFirstPassCorrect: null,
  lastFirstPassAt: null,
  lastFirstPassIncorrectAt: null,
  latestFirstPassMatchingRetryCorrect: null,
};

function isUsableVietnameseCue(card: ProductionChallengeCard): boolean {
  return card.meaningVi.trim().length > 0;
}

function typedRemediationBucket(evidence: TypedChallengeEvidence): number | null {
  if (
    evidence.latestFirstPassCorrect === false &&
    evidence.latestFirstPassMatchingRetryCorrect === false
  ) {
    return 1;
  }
  if (evidence.latestFirstPassCorrect === false) {
    return 2;
  }
  if (evidence.state === "NEEDS_PRACTICE") {
    return 3;
  }
  if (evidence.state === "MIXED") {
    return 4;
  }
  return null;
}

function compareStable(a: IndexedCandidate, b: IndexedCandidate): number {
  if (a.stableIndex !== b.stableIndex) return a.stableIndex - b.stableIndex;
  return a.card.normalizedTerm.localeCompare(b.card.normalizedTerm);
}

function compareRemediation(a: IndexedCandidate, b: IndexedCandidate): number {
  const aBucket = typedRemediationBucket(a.evidence) ?? Number.MAX_SAFE_INTEGER;
  const bBucket = typedRemediationBucket(b.evidence) ?? Number.MAX_SAFE_INTEGER;
  if (aBucket !== bBucket) return aBucket - bBucket;

  if (a.evidence.recentIncorrectCount !== b.evidence.recentIncorrectCount) {
    return b.evidence.recentIncorrectCount - a.evidence.recentIncorrectCount;
  }

  const aLastFailure = a.evidence.lastFirstPassIncorrectAt?.getTime() ?? 0;
  const bLastFailure = b.evidence.lastFirstPassIncorrectAt?.getTime() ?? 0;
  if (aLastFailure !== bLastFailure) return bLastFailure - aLastFailure;

  const aLast = a.evidence.lastFirstPassAt?.getTime() ?? 0;
  const bLast = b.evidence.lastFirstPassAt?.getTime() ?? 0;
  if (aLast !== bLast) return bLast - aLast;

  return compareStable(a, b);
}

function compareOldestTypedFirst(a: IndexedCandidate, b: IndexedCandidate): number {
  const aLast = a.evidence.lastFirstPassAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bLast = b.evidence.lastFirstPassAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aLast !== bLast) return aLast - bLast;
  return compareStable(a, b);
}

function takeUnique(
  selected: string[],
  selectedIds: Set<string>,
  candidates: IndexedCandidate[],
  limit: number
): void {
  for (const candidate of candidates) {
    if (selected.length >= limit) return;
    if (selectedIds.has(candidate.card.id)) continue;
    selectedIds.add(candidate.card.id);
    selected.push(candidate.card.id);
  }
}

/**
 * Selects one deterministic, typed-only Challenge session.
 *
 * The 16 / 8 / 1 allocation applies to the normal 25-card session. Smaller
 * API-requested sessions retain the same priority order and simply truncate it.
 */
export function selectProductionChallengeCardIds(
  cards: readonly ProductionChallengeCard[],
  typedEvidenceByCardId: ReadonlyMap<string, TypedChallengeEvidence>,
  now: Date,
  requestedCount: number = PRODUCTION_CHALLENGE_DEFAULT_COUNT
): string[] {
  const safeCount = Math.max(1, Math.min(requestedCount, cards.length));
  const candidates = cards
    .map((card, stableIndex) => ({
      card,
      stableIndex,
      evidence: typedEvidenceByCardId.get(card.id) ?? NO_TYPED_EVIDENCE,
    }))
    .filter(({ card }) => isUsableVietnameseCue(card));

  if (candidates.length === 0) return [];

  const remediation = candidates
    .filter((candidate) => typedRemediationBucket(candidate.evidence) !== null)
    .toSorted(compareRemediation);

  const neverTyped = candidates
    .filter(
      (candidate) =>
        candidate.evidence.lifetimeFirstPassAttempts === 0 &&
        typedRemediationBucket(candidate.evidence) === null
    )
    .toSorted(compareStable);

  const insufficientTyped = candidates
    .filter(
      (candidate) =>
        candidate.evidence.state === "INSUFFICIENT_DATA" &&
        typedRemediationBucket(candidate.evidence) === null
    )
    .toSorted(compareOldestTypedFirst);

  const coverage = [...neverTyped, ...insufficientTyped];
  const maintenanceCutoff = now.getTime() - PRODUCTION_CHALLENGE_MAINTENANCE_COOLDOWN_MS;
  const maintenance = candidates
    .filter(
      (candidate) =>
        candidate.evidence.state === "STRONG" &&
        candidate.evidence.lifetimeFirstPassAttempts > 0 &&
        candidate.evidence.lastFirstPassAt !== null &&
        candidate.evidence.lastFirstPassAt.getTime() <= maintenanceCutoff
    )
    .toSorted(compareOldestTypedFirst);

  const strongFallback = candidates
    .filter(
      (candidate) =>
        candidate.evidence.state === "STRONG" &&
        candidate.evidence.lifetimeFirstPassAttempts > 0
    )
    .toSorted(compareOldestTypedFirst);

  const selected: string[] = [];
  const selectedIds = new Set<string>();
  const remediationLimit = Math.min(PRODUCTION_CHALLENGE_REMEDIATION_LIMIT, safeCount);
  const coverageLimit = Math.min(
    remediationLimit + PRODUCTION_CHALLENGE_COVERAGE_LIMIT,
    safeCount
  );
  const maintenanceLimit = Math.min(
    coverageLimit + PRODUCTION_CHALLENGE_MAINTENANCE_LIMIT,
    safeCount
  );

  takeUnique(selected, selectedIds, remediation, remediationLimit);
  takeUnique(selected, selectedIds, coverage, coverageLimit);
  takeUnique(selected, selectedIds, maintenance, maintenanceLimit);

  // Preserve coverage before letting a large weak set consume unused capacity.
  takeUnique(selected, selectedIds, coverage, safeCount);
  takeUnique(selected, selectedIds, remediation, safeCount);
  takeUnique(selected, selectedIds, maintenance, safeCount);
  takeUnique(selected, selectedIds, strongFallback, safeCount);

  return selected;
}
