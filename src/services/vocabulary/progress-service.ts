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
}: ProgressAnalyticsInput): ProgressAnalytics {
  const tz = normalizeTimezone(timezone);
  const todayKey = getTodayDateKey(tz, now);
  const todayStart = getStartOfDayInTimezone(todayKey, tz);
  const todayEnd = getEndOfDayInTimezone(todayKey, tz);

  const cards = decks.flatMap((deck) => deck.cards);
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

    const deckFirstPass = firstPassByDeck.get(card.deckId);
    if (deckFirstPass) {
      deckFirstPass.total += evidence.firstPassAttempts;
      deckFirstPass.correct += evidence.firstPassCorrect;
    }

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
        weakCards: weakCards.filter((card) => card.deckId === deck.id).length,
        reviewedRecently: reviewLogs.filter((log) => deckCardIds.has(log.cardId) && log.review >= activityStart).length,
        firstPass: performance("Kết quả lần đầu", deckFirstPass.total, deckFirstPass.correct),
      };
    })
    .sort((a, b) => b.dueToday - a.dueToday || b.weakCards - a.weakCards || a.name.localeCompare(b.name));

  const foldersById = new Map<string, ProgressFolderInsight>();
  for (const deck of decks) {
    if (!deck.folderId || !deck.folderName) continue;
    const item = foldersById.get(deck.folderId) ?? {
      id: deck.folderId,
      name: deck.folderName,
      deckCount: 0,
      totalCards: 0,
      dueToday: 0,
      weakCards: 0,
    };
    item.deckCount += 1;
    item.totalCards += deck.cards.length;
    item.dueToday += deck.cards.filter((card) => card.state > 0 && card.due <= now).length;
    item.weakCards += weakCards.filter((card) => card.deckId === deck.id).length;
    foldersById.set(deck.folderId, item);
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
        cards: {
          select: {
            id: true,
            deckId: true,
            term: true,
            normalizedTerm: true,
            meaningVi: true,
            state: true,
            due: true,
          },
        },
      },
    });

    const deckRecords: ProgressDeckRecord[] = decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      folderId: deck.folderId,
      folderName: deck.folder?.name ?? null,
      cards: deck.cards,
    }));
    const cardIds = deckRecords.flatMap((deck) => deck.cards.map((card) => card.id));
    const deckIds = deckRecords.map((deck) => deck.id);
    const isGlobal = scope.kind === "global";

    const evidencePromise =
      cardIds.length > 0
        ? practiceEvidenceService.getDeckPracticeEvidence(deckIds)
        : Promise.resolve(null);
    const [scopedLogs, evidenceResult, quizAttempts] = await Promise.all([
      cardIds.length > 0
        ? db.reviewLog.findMany({
            where: isGlobal ? undefined : { cardId: { in: cardIds } },
            select: { cardId: true, rating: true, review: true },
          })
        : [],
      evidencePromise,
      deckIds.length > 0
        ? db.quizAttempt.findMany({ where: { deckId: { in: deckIds } }, select: { deckId: true } })
        : [],
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
    });
  }
}

export const progressService = new ProgressService();
