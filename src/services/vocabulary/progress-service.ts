import { db } from "@/lib/db";
import {
  DEFAULT_STUDY_TIMEZONE,
  getEndOfDayInTimezone,
  getLocalDateKey,
  getStartOfDayInTimezone,
  getTodayDateKey,
  normalizeTimezone,
  offsetDateKey,
} from "@/lib/study-timezone";
import {
  buildReviewActivity,
  type ReviewActivityData,
} from "./review-activity-service";
import {
  EVIDENCE_CONFIG,
  getNeedPracticePriority,
  isWeakCardSummary,
  practiceEvidenceService,
  type PracticeEvidenceSummary,
} from "./practice-evidence-service";

export type ProgressScopeKind = "global" | "folder" | "deck";

export interface ProgressScope {
  kind: ProgressScopeKind;
  id?: string;
  name: string;
  parentName?: string | null;
}

export interface ProgressDateCount {
  date: string;
  label: string;
  count: number;
}

export interface ProgressStateCount {
  key: "new" | "learning" | "review" | "relearning";
  label: string;
  count: number;
}

export interface ProgressPerformance {
  label: string;
  total: number;
  correct: number;
  accuracy: number | null;
  hasSufficientEvidence: boolean;
}

export interface ProgressRatingCount {
  rating: 1 | 2 | 3 | 4;
  label: string;
  count: number;
}

export interface ProgressWeakCard {
  id: string;
  deckId: string;
  deckName: string;
  term: string;
  meaningVi: string;
  reason: string;
  priority: number;
}

export interface ProgressDeckInsight {
  id: string;
  name: string;
  folderId: string | null;
  folderName: string | null;
  totalCards: number;
  dueToday: number;
  weakCards: number;
  reviewedRecently: number;
  firstPass: ProgressPerformance;
}

export interface ProgressFolderInsight {
  id: string;
  name: string;
  deckCount: number;
  totalCards: number;
  dueToday: number;
  weakCards: number;
}

export interface GlobalTypingActivity extends ProgressDateCount {
  correct: number;
  accuracy: number | null;
}

export interface GlobalTypingMistake {
  flashcardId: string;
  term: string;
  meaningVi: string;
  count: number;
}

export interface OnlineTimeDay {
  date: string;
  label: string;
  activeSeconds: number;
}

export interface OnlineTimeAnalytics {
  days: OnlineTimeDay[];
  todaySeconds: number;
  totalSeconds: number;
  activeDays: number;
}

/** Practice-only activity for the global Vietnamese-to-English typing mode. */
export interface GlobalTypingAnalytics {
  total: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  uniqueCards: number;
  sessions: number;
  assistedTotal: number;
  assistedCorrect: number;
  unassistedCorrect: number;
  activity: GlobalTypingActivity[];
  recentAccuracyChange: number | null;
  frequentMistakes: GlobalTypingMistake[];
}

export interface ProgressAnalytics {
  scope: ProgressScope;
  today: {
    due: number;
    overdue: number;
    reviewedCards: number;
    reviewEvents: number;
    totalCards: number;
    weakCards: number;
  };
  activity: ProgressDateCount[];
  upcomingDue: ProgressDateCount[];
  states: ProgressStateCount[];
  practice: {
    firstPass: ProgressPerformance;
    recognition: ProgressPerformance;
    production: ProgressPerformance;
    byType: ProgressPerformance[];
    retry: ProgressPerformance;
    sessions: number;
    assessedCards: number;
    hasSufficientEvidence: boolean;
  };
  reviewRatings: ProgressRatingCount[];
  weakCards: ProgressWeakCard[];
  decks: ProgressDeckInsight[];
  folders: ProgressFolderInsight[];
  reviewActivity: ReviewActivityData;
  onlineTime: OnlineTimeAnalytics;
  globalTyping?: GlobalTypingAnalytics;
}

export interface ProgressCardRecord {
  id: string;
  deckId: string;
  term: string;
  normalizedTerm: string;
  meaningVi: string;
  state: number;
  due: Date;
}

export interface ProgressDeckRecord {
  id: string;
  name: string;
  folderId: string | null;
  folderName: string | null;
  cards: ProgressCardRecord[];
}

export interface ProgressAnalyticsInput {
  scope: ProgressScope;
  decks: ProgressDeckRecord[];
  reviewLogs: Array<{ cardId: string; rating: number; review: Date }>;
  practiceEvidence: Map<string, PracticeEvidenceSummary>;
  quizAttempts: Array<{ deckId: string }>;
  now?: Date;
  timezone?: string;
  allTimeReviewLogs?: Array<{ cardId?: string; rating?: number; review: Date }>;
  globalTypingAttempts?: Array<{
    sessionId: string;
    flashcardId: string;
    correct: boolean;
    createdAt: Date;
    term: string;
    meaningVi: string;
    assisted: boolean;
  }>;
  onlineActivity?: Array<{
    date: string;
    activeSeconds: number;
  }>;
}

function dayLabel(date: Date, timezone: string = DEFAULT_STUDY_TIMEZONE): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: timezone, weekday: "short", day: "numeric" }).format(date);
}

function performance(label: string, total: number, correct: number): ProgressPerformance {
  return {
    label,
    total,
    correct,
    accuracy: total > 0 ? Number(((correct / total) * 100).toFixed(1)) : null,
    hasSufficientEvidence: total >= EVIDENCE_CONFIG.MIN_STABLE_ATTEMPTS,
  };
}

function stateKey(state: number): ProgressStateCount["key"] {
  if (state === 1) return "learning";
  if (state === 2) return "review";
  if (state === 3) return "relearning";
  return "new";
}

function stateLabel(key: ProgressStateCount["key"]): string {
  return {
    new: "Mới",
    learning: "Đang học",
    review: "Đang ôn",
    relearning: "Học lại",
  }[key];
}

function buildGlobalTypingAnalytics(
  attempts: NonNullable<ProgressAnalyticsInput["globalTypingAttempts"]>,
  todayKey: string,
  timezone: string
): GlobalTypingAnalytics {
  const total = attempts.length;
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const assistedAttempts = attempts.filter((attempt) => attempt.assisted);
  const byDate = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    const key = getLocalDateKey(attempt.createdAt, timezone);
    const current = byDate.get(key) ?? { total: 0, correct: 0 };
    current.total += 1;
    if (attempt.correct) current.correct += 1;
    byDate.set(key, current);
  }

  const activity = Array.from({ length: 14 }, (_, index) => {
    const key = offsetDateKey(todayKey, -13 + index);
    const value = byDate.get(key) ?? { total: 0, correct: 0 };
    return {
      date: key,
      label: dayLabel(getStartOfDayInTimezone(key, timezone), timezone),
      count: value.total,
      correct: value.correct,
      accuracy: value.total > 0 ? Number(((value.correct / value.total) * 100).toFixed(1)) : null,
    };
  });
  const previous = activity.slice(0, 7).reduce(
    (summary, day) => ({ total: summary.total + day.count, correct: summary.correct + day.correct }),
    { total: 0, correct: 0 }
  );
  const recent = activity.slice(7).reduce(
    (summary, day) => ({ total: summary.total + day.count, correct: summary.correct + day.correct }),
    { total: 0, correct: 0 }
  );
  const recentAccuracyChange =
    previous.total > 0 && recent.total > 0
      ? Number(((recent.correct / recent.total - previous.correct / previous.total) * 100).toFixed(1))
      : null;

  const mistakeMap = new Map<string, GlobalTypingMistake>();
  for (const attempt of attempts) {
    if (attempt.correct) continue;
    const current = mistakeMap.get(attempt.flashcardId);
    if (current) {
      current.count += 1;
    } else {
      mistakeMap.set(attempt.flashcardId, {
        flashcardId: attempt.flashcardId,
        term: attempt.term,
        meaningVi: attempt.meaningVi,
        count: 1,
      });
    }
  }

  return {
    total,
    correct,
    incorrect: total - correct,
    accuracy: total > 0 ? Number(((correct / total) * 100).toFixed(1)) : null,
    uniqueCards: new Set(attempts.map((attempt) => attempt.flashcardId)).size,
    sessions: new Set(attempts.map((attempt) => attempt.sessionId)).size,
    assistedTotal: assistedAttempts.length,
    assistedCorrect: assistedAttempts.filter((attempt) => attempt.correct).length,
    unassistedCorrect: attempts.filter((attempt) => attempt.correct && !attempt.assisted).length,
    activity,
    recentAccuracyChange,
    frequentMistakes: [...mistakeMap.values()]
      .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
      .slice(0, 5),
  };
}

function buildOnlineTimeAnalytics(
  activity: NonNullable<ProgressAnalyticsInput["onlineActivity"]>,
  todayKey: string,
  timezone: string
): OnlineTimeAnalytics {
  const secondsByDate = new Map(
    activity.map((entry) => [entry.date, Math.max(0, Math.floor(entry.activeSeconds))])
  );
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = offsetDateKey(todayKey, -13 + index);
    return {
      date,
      label: dayLabel(getStartOfDayInTimezone(date, timezone), timezone),
      activeSeconds: secondsByDate.get(date) ?? 0,
    };
  });

  return {
    days,
    todaySeconds: days.at(-1)?.activeSeconds ?? 0,
    totalSeconds: days.reduce((sum, day) => sum + day.activeSeconds, 0),
    activeDays: days.filter((day) => day.activeSeconds > 0).length,
  };
}

/**
 * Pure aggregation used by the service and focused unit tests. It reports
 * observed activity and evidence, not a synthetic "mastery" or retention score.
 */
export function buildProgressAnalytics({
  scope,
  decks,
  reviewLogs,
  practiceEvidence,
  quizAttempts,
  now = new Date(),
  timezone = DEFAULT_STUDY_TIMEZONE,
  allTimeReviewLogs,
  globalTypingAttempts = [],
  onlineActivity = [],
}: ProgressAnalyticsInput): ProgressAnalytics {
  const tz = normalizeTimezone(timezone);
  const todayKey = getTodayDateKey(tz, now);
  const todayStart = getStartOfDayInTimezone(todayKey, tz);
  const todayEnd = getEndOfDayInTimezone(todayKey, tz);

  const cardOccurrences = decks.flatMap((deck) => deck.cards);
  // Aggregates describe vocabulary progress, not source memberships. A shared
  // card is therefore counted once in a combined Folder/global projection.
  const cards = [...new Map(cardOccurrences.map((card) => [card.id, card])).values()];
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));

  // Keep the primary CTA in lockstep with FSRSService.getReviewQueue(): these
  // are cards that can be reviewed now, not cards merely scheduled later today.
  const due = cards.filter((card) => card.state > 0 && card.due <= now);
  const overdue = cards.filter((card) => card.state > 0 && card.due < todayStart);
  const reviewEvents = reviewLogs.filter((log) => log.review >= todayStart && log.review <= todayEnd);
  const reviewedCards = new Set(reviewEvents.map((log) => log.cardId)).size;

  const stateCounts: Record<ProgressStateCount["key"], number> = {
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0,
  };
  for (const card of cards) stateCounts[stateKey(card.state)] += 1;
  const states = (Object.keys(stateCounts) as ProgressStateCount["key"][]).map((key) => ({
    key,
    label: stateLabel(key),
    count: stateCounts[key],
  }));

  const activityStartKey = offsetDateKey(todayKey, -13);
  const activityStart = getStartOfDayInTimezone(activityStartKey, tz);
  const activity = Array.from({ length: 14 }, (_, index) => {
    const key = offsetDateKey(todayKey, -13 + index);
    const dateInstant = getStartOfDayInTimezone(key, tz);
    return {
      date: key,
      label: dayLabel(dateInstant, tz),
      count: reviewLogs.filter((log) => getLocalDateKey(log.review, tz) === key).length,
    };
  });

  const upcomingDue = Array.from({ length: 7 }, (_, index) => {
    const key = offsetDateKey(todayKey, index);
    const start = getStartOfDayInTimezone(key, tz);
    const end = getEndOfDayInTimezone(key, tz);
    return {
      date: key,
      label: dayLabel(start, tz),
      count: cards.filter((card) => card.state > 0 && card.due > now && card.due >= start && card.due <= end).length,
    };
  });

  const reviewActivity = buildReviewActivity({
    periodDays: 364,
    timezone: tz,
    now,
    allTimeLogs: allTimeReviewLogs ?? reviewLogs,
  });
  const globalTyping = buildGlobalTypingAnalytics(globalTypingAttempts, todayKey, tz);
  const onlineTime = buildOnlineTimeAnalytics(onlineActivity, todayKey, tz);

  const weakCards: ProgressWeakCard[] = [];
  let assessedCards = 0;
  const practiceTotals = {
    firstPass: { total: 0, correct: 0 },
    retry: { total: 0, correct: 0 },
    recognition: { total: 0, correct: 0 },
    production: { total: 0, correct: 0 },
  };
  const firstPassByDeck = new Map(decks.map((deck) => [deck.id, { total: 0, correct: 0 }]));

  for (const card of cards) {
    const evidence = practiceEvidence.get(card.id);
    if (!evidence) continue;

    practiceTotals.firstPass.total += evidence.firstPassAttempts;
    practiceTotals.firstPass.correct += evidence.firstPassCorrect;
    practiceTotals.retry.total += evidence.retryAttempts;
    practiceTotals.retry.correct += evidence.retryCorrect;
    practiceTotals.recognition.total += evidence.recognitionAxis.lifetimeFirstPassAttempts;
    practiceTotals.recognition.correct += evidence.recognitionAxis.lifetimeFirstPassCorrect;
    practiceTotals.production.total += evidence.productionAxis.lifetimeFirstPassAttempts;
    practiceTotals.production.correct += evidence.productionAxis.lifetimeFirstPassCorrect;

    if (evidence.firstPassAttempts >= EVIDENCE_CONFIG.MIN_STABLE_ATTEMPTS) assessedCards += 1;
    if (!isWeakCardSummary(evidence)) continue;
    const deck = deckById.get(card.deckId);
    if (!deck) continue;
    weakCards.push({
      id: card.id,
      deckId: card.deckId,
      deckName: deck.name,
      term: card.term,
      meaningVi: card.meaningVi,
      reason: evidence.explanationVi,
      priority: getNeedPracticePriority(evidence),
    });
  }

  // Source-level insight intentionally shows the shared learning signal in
  // every Deck that contains the card. It must not alter global totals above.
  for (const deck of decks) {
    const deckFirstPass = firstPassByDeck.get(deck.id);
    if (!deckFirstPass) continue;
    for (const card of deck.cards) {
      const evidence = practiceEvidence.get(card.id);
      if (!evidence) continue;
      deckFirstPass.total += evidence.firstPassAttempts;
      deckFirstPass.correct += evidence.firstPassCorrect;
    }
  }
  weakCards.sort((a, b) => b.priority - a.priority || a.term.localeCompare(b.term));

  const recognition = performance(
    "Nhận diện",
    practiceTotals.recognition.total,
    practiceTotals.recognition.correct
  );
  const production = performance(
    "Tự nhớ & viết",
    practiceTotals.production.total,
    practiceTotals.production.correct
  );
  const byType = [recognition, production].filter((item) => item.total > 0);

  const ratingLabels: Record<number, string> = { 1: "Lại", 2: "Khó", 3: "Tốt", 4: "Dễ" };
  const reviewRatings = ([1, 2, 3, 4] as const).map((rating) => ({
    rating,
    label: ratingLabels[rating],
    count: reviewLogs.filter((log) => log.rating === rating).length,
  }));

  const decksInsight = decks
    .map((deck) => {
      const deckCardIds = new Set(deck.cards.map((card) => card.id));
      const deckFirstPass = firstPassByDeck.get(deck.id) ?? { total: 0, correct: 0 };
      return {
        id: deck.id,
        name: deck.name,
        folderId: deck.folderId,
        folderName: deck.folderName,
        totalCards: deck.cards.length,
        dueToday: deck.cards.filter((card) => card.state > 0 && card.due <= now).length,
        weakCards: deck.cards.filter((card) => {
          const evidence = practiceEvidence.get(card.id);
          return evidence ? isWeakCardSummary(evidence) : false;
        }).length,
        reviewedRecently: reviewLogs.filter((log) => deckCardIds.has(log.cardId) && log.review >= activityStart).length,
        firstPass: performance("Kết quả lần đầu", deckFirstPass.total, deckFirstPass.correct),
      };
    })
    .sort((a, b) => b.dueToday - a.dueToday || b.weakCards - a.weakCards || a.name.localeCompare(b.name));

  const folderDecksById = new Map<string, ProgressDeckRecord[]>();
  for (const deck of decks) {
    if (!deck.folderId || !deck.folderName) continue;
    const folderDecks = folderDecksById.get(deck.folderId) ?? [];
    folderDecks.push(deck);
    folderDecksById.set(deck.folderId, folderDecks);
  }

  const foldersById = new Map<string, ProgressFolderInsight>();
  for (const [folderId, folderDecks] of folderDecksById) {
    const folderCards = [...new Map(folderDecks.flatMap((deck) => deck.cards).map((card) => [card.id, card])).values()];
    const firstDeck = folderDecks[0];
    foldersById.set(folderId, {
      id: folderId,
      name: firstDeck.folderName!,
      deckCount: folderDecks.length,
      totalCards: folderCards.length,
      dueToday: folderCards.filter((card) => card.state > 0 && card.due <= now).length,
      weakCards: folderCards.filter((card) => {
        const evidence = practiceEvidence.get(card.id);
        return evidence ? isWeakCardSummary(evidence) : false;
      }).length,
    });
  }
  const folders = [...foldersById.values()].sort(
    (a, b) => b.dueToday - a.dueToday || b.weakCards - a.weakCards || a.name.localeCompare(b.name)
  );

  return {
    scope,
    today: {
      due: due.length,
      overdue: overdue.length,
      reviewedCards,
      reviewEvents: reviewEvents.length,
      totalCards: cards.length,
      weakCards: weakCards.length,
    },
    activity,
    upcomingDue,
    states,
    practice: {
      firstPass: performance(
        "Kết quả lần đầu",
        practiceTotals.firstPass.total,
        practiceTotals.firstPass.correct
      ),
      recognition,
      production,
      byType,
      retry: performance("Luyện lại", practiceTotals.retry.total, practiceTotals.retry.correct),
      sessions: quizAttempts.length,
      assessedCards,
      hasSufficientEvidence: assessedCards > 0,
    },
    reviewRatings,
    weakCards: weakCards.slice(0, 8),
    decks: decksInsight,
    folders,
    reviewActivity,
    onlineTime,
    globalTyping,
  };
}

export class ProgressService {
  async getGlobalAnalytics(timezone?: string): Promise<ProgressAnalytics> {
    return this.getAnalytics({ kind: "global", name: "Tất cả bộ từ" }, timezone);
  }

  async getFolderAnalytics(folderId: string, timezone?: string): Promise<ProgressAnalytics | null> {
    const folder = await db.folder.findUnique({
      where: { id: folderId },
      select: { id: true, name: true },
    });
    if (!folder) return null;
    return this.getAnalytics({ kind: "folder", id: folder.id, name: folder.name }, timezone);
  }

  async getDeckAnalytics(deckId: string, timezone?: string): Promise<ProgressAnalytics | null> {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { id: true, name: true, folder: { select: { name: true } } },
    });
    if (!deck) return null;
    return this.getAnalytics(
      {
        kind: "deck",
        id: deck.id,
        name: deck.name,
        parentName: deck.folder?.name ?? null,
      },
      timezone
    );
  }

  private async getAnalytics(scope: ProgressScope, timezone?: string): Promise<ProgressAnalytics> {
    const resolvedTimezone = normalizeTimezone(timezone);
    const deckWhere = scope.kind === "deck" ? { id: scope.id } : scope.kind === "folder" ? { folderId: scope.id } : {};
    const decks = await db.deck.findMany({
      where: deckWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        folderId: true,
        folder: { select: { name: true } },
        vocabularyMemberships: {
          select: {
            flashcard: {
              select: {
                id: true,
                term: true,
                normalizedTerm: true,
                meaningVi: true,
                state: true,
                due: true,
              },
            },
          },
        },
      },
    });

    const deckRecords: ProgressDeckRecord[] = decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      folderId: deck.folderId,
      folderName: deck.folder?.name ?? null,
      cards: deck.vocabularyMemberships.map(({ flashcard }) => ({
        ...flashcard,
        deckId: deck.id,
      })),
    }));
    const cardIds = deckRecords.flatMap((deck) => deck.cards.map((card) => card.id));
    const deckIds = deckRecords.map((deck) => deck.id);
    const isGlobal = scope.kind === "global";
    const onlineActivityTodayKey = getTodayDateKey(resolvedTimezone);
    const onlineActivityStartKey = offsetDateKey(onlineActivityTodayKey, -13);

    const evidencePromise =
      cardIds.length > 0
        ? practiceEvidenceService.getDeckPracticeEvidence(deckIds)
        : Promise.resolve(null);
    const [scopedLogs, evidenceResult, quizAttempts, globalTypingAttempts, onlineActivity] = await Promise.all([
      cardIds.length > 0
        ? db.reviewLog.findMany({
            where: isGlobal ? undefined : { cardId: { in: cardIds } },
            select: { cardId: true, rating: true, review: true },
          })
        : [],
      evidencePromise,
      deckIds.length > 0
        ? db.quizAttempt
            .findMany({ where: { deckId: { in: deckIds } }, select: { deckId: true } })
            .then((attempts) => attempts.flatMap((attempt) => attempt.deckId ? [{ deckId: attempt.deckId }] : []))
        : [],
      isGlobal
        ? db.practiceAttempt.findMany({
            where: { mode: { in: ["global_typing", "global_typing_hint"] }, attemptNumber: 1 },
            select: {
              sessionId: true,
              flashcardId: true,
              correct: true,
              createdAt: true,
              mode: true,
              flashcard: { select: { term: true, meaningVi: true } },
            },
          })
        : Promise.resolve([]),
      isGlobal
        ? db.dailyOnlineActivity.findMany({
            where: {
              date: {
                gte: onlineActivityStartKey,
                lte: onlineActivityTodayKey,
              },
            },
            select: { date: true, activeSeconds: true },
          })
        : Promise.resolve([]),
    ]);

    const reviewLogs = scopedLogs;
    const allTimeReviewLogs = scopedLogs;

    return buildProgressAnalytics({
      scope,
      decks: deckRecords,
      reviewLogs,
      practiceEvidence: evidenceResult?.summaries ?? new Map(),
      quizAttempts,
      timezone: resolvedTimezone,
      allTimeReviewLogs,
      globalTypingAttempts: globalTypingAttempts.map((attempt) => ({
        sessionId: attempt.sessionId,
        flashcardId: attempt.flashcardId,
        correct: attempt.correct,
        createdAt: attempt.createdAt,
        term: attempt.flashcard.term,
        meaningVi: attempt.flashcard.meaningVi,
        assisted: attempt.mode === "global_typing_hint",
      })),
      onlineActivity,
    });
  }
}

export const progressService = new ProgressService();
