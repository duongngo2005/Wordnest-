import { PracticeAttempt } from "@prisma/client";
import { db } from "@/lib/db";
import {
  aggregateCardPracticeEvidence,
  getNeedPracticePriority,
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
    reviewed: number;
    totalCards: number;
    weakCards: number;
  };
  activity: ProgressDateCount[];
  upcomingDue: ProgressDateCount[];
  states: ProgressStateCount[];
  practice: {
    firstPass: ProgressPerformance;
    byType: ProgressPerformance[];
    retry: ProgressPerformance;
    sessions: number;
  };
  reviewRatings: ProgressRatingCount[];
  weakCards: ProgressWeakCard[];
  decks: ProgressDeckInsight[];
  folders: ProgressFolderInsight[];
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
  practiceAttempts: PracticeAttempt[];
  quizAttempts: Array<{ deckId: string }>;
  now?: Date;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = startOfDay(date);
  result.setDate(result.getDate() + 1);
  result.setMilliseconds(-1);
  return result;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function dateKey(date: Date): string {
  const local = startOfDay(date);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(
    local.getDate()
  ).padStart(2, "0")}`;
}

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "numeric" }).format(date);
}

function performance(label: string, attempts: Array<{ correct: boolean }>): ProgressPerformance {
  const total = attempts.length;
  const correct = attempts.filter((attempt) => attempt.correct).length;
  return {
    label,
    total,
    correct,
    accuracy: total > 0 ? Number(((correct / total) * 100).toFixed(1)) : null,
  };
}

function questionTypeLabel(questionType: string): "Gõ từ" | "Trắc nghiệm" | "Story Cloze" | "Khác" {
  if (questionType === "typed_vi_en") return "Gõ từ";
  if (questionType === "story_cloze") return "Story Cloze";
  if (questionType === "multiple_choice" || questionType.startsWith("multiple_choice") || questionType === "fill_in_blank") {
    return "Trắc nghiệm";
  }
  return "Khác";
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
  practiceAttempts,
  quizAttempts,
  now = new Date(),
}: ProgressAnalyticsInput): ProgressAnalytics {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const cards = decks.flatMap((deck) => deck.cards);
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const cardById = new Map(cards.map((card) => [card.id, card]));

  const due = cards.filter((card) => card.state > 0 && card.due <= todayEnd);
  const overdue = cards.filter((card) => card.state > 0 && card.due < todayStart);
  const reviewed = reviewLogs.filter((log) => log.review >= todayStart && log.review <= todayEnd).length;

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

  const activityStart = addDays(todayStart, -13);
  const activity = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(activityStart, index);
    const key = dateKey(date);
    return {
      date: key,
      label: dayLabel(date),
      count: reviewLogs.filter((log) => dateKey(log.review) === key).length,
    };
  });

  const upcomingDue = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(todayStart, index);
    const end = endOfDay(date);
    return {
      date: dateKey(date),
      label: index === 0 ? "Hôm nay" : dayLabel(date),
      count: cards.filter((card) => card.state > 0 && card.due >= date && card.due <= end).length,
    };
  });

  const attemptsByCard = new Map<string, PracticeAttempt[]>();
  for (const attempt of practiceAttempts) {
    const attempts = attemptsByCard.get(attempt.flashcardId) ?? [];
    attempts.push(attempt);
    attemptsByCard.set(attempt.flashcardId, attempts);
  }

  const weakCards: ProgressWeakCard[] = [];
  for (const card of cards) {
    const evidence: PracticeEvidenceSummary = aggregateCardPracticeEvidence(card.id, attemptsByCard.get(card.id) ?? []);
    if (evidence.classification !== "NEEDS_PRACTICE" && evidence.classification !== "MIXED") continue;
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

  const firstPassAttempts = practiceAttempts.filter((attempt) => attempt.attemptNumber === 1);
  const retries = practiceAttempts.filter((attempt) => attempt.attemptNumber === 2);
  const byTypeOrder: Array<ReturnType<typeof questionTypeLabel>> = ["Gõ từ", "Trắc nghiệm", "Story Cloze", "Khác"];
  const byType = byTypeOrder
    .map((label) => performance(label, firstPassAttempts.filter((attempt) => questionTypeLabel(attempt.questionType) === label)))
    .filter((item) => item.total > 0);

  const ratingLabels: Record<number, string> = { 1: "Lại", 2: "Khó", 3: "Tốt", 4: "Dễ" };
  const reviewRatings = ([1, 2, 3, 4] as const).map((rating) => ({
    rating,
    label: ratingLabels[rating],
    count: reviewLogs.filter((log) => log.rating === rating).length,
  }));

  const decksInsight = decks
    .map((deck) => {
      const deckCardIds = new Set(deck.cards.map((card) => card.id));
      const deckAttempts = firstPassAttempts.filter((attempt) => deckCardIds.has(attempt.flashcardId));
      return {
        id: deck.id,
        name: deck.name,
        folderId: deck.folderId,
        folderName: deck.folderName,
        totalCards: deck.cards.length,
        dueToday: deck.cards.filter((card) => card.state > 0 && card.due <= todayEnd).length,
        weakCards: weakCards.filter((card) => card.deckId === deck.id).length,
        reviewedRecently: reviewLogs.filter((log) => deckCardIds.has(log.cardId) && log.review >= activityStart).length,
        firstPass: performance("Kết quả lần đầu", deckAttempts),
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
    item.dueToday += deck.cards.filter((card) => card.state > 0 && card.due <= todayEnd).length;
    item.weakCards += weakCards.filter((card) => card.deckId === deck.id).length;
    foldersById.set(deck.folderId, item);
  }
  const folders = [...foldersById.values()].sort(
    (a, b) => b.dueToday - a.dueToday || b.weakCards - a.weakCards || a.name.localeCompare(b.name)
  );

  const scopedFirstPass = firstPassAttempts.filter((attempt) => cardById.has(attempt.flashcardId));

  return {
    scope,
    today: {
      due: due.length,
      overdue: overdue.length,
      reviewed,
      totalCards: cards.length,
      weakCards: weakCards.length,
    },
    activity,
    upcomingDue,
    states,
    practice: {
      firstPass: performance("Kết quả lần đầu", scopedFirstPass),
      byType,
      retry: performance("Luyện lại", retries.filter((attempt) => cardById.has(attempt.flashcardId))),
      sessions: quizAttempts.length,
    },
    reviewRatings,
    weakCards: weakCards.slice(0, 8),
    decks: decksInsight,
    folders,
  };
}

export class ProgressService {
  async getGlobalAnalytics(): Promise<ProgressAnalytics> {
    return this.getAnalytics({ kind: "global", name: "Tất cả bộ từ" });
  }

  async getFolderAnalytics(folderId: string): Promise<ProgressAnalytics | null> {
    const folder = await db.folder.findUnique({
      where: { id: folderId },
      select: { id: true, name: true },
    });
    if (!folder) return null;
    return this.getAnalytics({ kind: "folder", id: folder.id, name: folder.name });
  }

  async getDeckAnalytics(deckId: string): Promise<ProgressAnalytics | null> {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { id: true, name: true, folder: { select: { name: true } } },
    });
    if (!deck) return null;
    return this.getAnalytics({
      kind: "deck",
      id: deck.id,
      name: deck.name,
      parentName: deck.folder?.name ?? null,
    });
  }

  private async getAnalytics(scope: ProgressScope): Promise<ProgressAnalytics> {
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

    const [reviewLogs, practiceAttempts, quizAttempts] = await Promise.all([
      cardIds.length > 0
        ? db.reviewLog.findMany({
            where: { cardId: { in: cardIds } },
            select: { cardId: true, rating: true, review: true },
          })
        : [],
      cardIds.length > 0
        ? db.practiceAttempt.findMany({
            where: { flashcardId: { in: cardIds } },
            orderBy: { createdAt: "asc" },
          })
        : [],
      deckIds.length > 0
        ? db.quizAttempt.findMany({ where: { deckId: { in: deckIds } }, select: { deckId: true } })
        : [],
    ]);

    return buildProgressAnalytics({
      scope,
      decks: deckRecords,
      reviewLogs,
      practiceAttempts,
      quizAttempts,
    });
  }
}

export const progressService = new ProgressService();
