import { db } from "@/lib/db";
import { PracticeAttempt, Prisma } from "@prisma/client";
import { normalizeStoryVocabulary } from "@/lib/story/story-vocabulary";
import { extractSentenceContainingUsageWithBoundary } from "@/lib/story/story-context";

/**
 * Transparent practice signal classification categories.
 * These are learning practice signals, NOT scientific mastery probabilities.
 */
export type PracticeSignalCategory =
  | "NO_EVIDENCE"          // Chưa có dữ liệu first-pass practice
  | "INSUFFICIENT_DATA"    // Chỉ mới có 1 lần làm bài (chưa đủ dữ liệu để kết luận)
  | "NEEDS_PRACTICE"       // Có thất bại first-pass gần đây hoặc tỷ lệ sai cao rõ ràng
  | "MIXED"                // Kết quả first-pass gần đây vừa đúng vừa sai (chưa ổn định)
  | "RECENTLY_SUCCESSFUL"; // Thực hành gần đây chủ yếu / hoàn toàn đúng

export interface QuestionTypeEvidence {
  attempts: number;
  correct: number;
  incorrect: number;
}

export interface QuestionTypeBreakdown {
  typedRecall: QuestionTypeEvidence;   // typed_vi_en (Active recall from Vietnamese to English)
  storyCloze: QuestionTypeEvidence;    // story_cloze (Contextual cloze inside story)
  multipleChoice: QuestionTypeEvidence;// multiple_choice_en_vi, multiple_choice_vi_en, fill_in_blank (Recognition)
  other: QuestionTypeEvidence;         // Extended future modes
}

export interface RecentAttemptSnapshot {
  attemptNumber: number;
  correct: boolean;
  questionType: string;
  responseMs: number | null;
  createdAt: Date;
}

export interface RecentModalityEvidence {
  attempts: number;
  correct: number;
  incorrect: number;
  latestFirstPassCorrect: boolean | null;
  latestFirstPassAt: Date | null;
}

export interface RecentModalityBreakdown {
  typedRecall: RecentModalityEvidence;
  storyCloze: RecentModalityEvidence;
  multipleChoice: RecentModalityEvidence;
}

export interface PracticeEvidenceSummary {
  flashcardId: string;

  // First-pass statistics (attemptNumber = 1) - PRIMARY retrieval evidence
  firstPassAttempts: number;
  firstPassCorrect: number;
  firstPassIncorrect: number;

  // Retry statistics (attemptNumber = 2) - REINFORCEMENT evidence after feedback
  retryAttempts: number;
  retryCorrect: number;     // correctedOnRetry
  retryIncorrect: number;   // stillIncorrectOnRetry

  // Recency indicators
  latestFirstPassCorrect: boolean | null;
  lastPracticedAt: Date | null;

  // Question-type breakdown (must stay strictly separate, no numeric weighting)
  breakdownByQuestionType: QuestionTypeBreakdown;

  // Recent first-pass window (last N attempts per card)
  recentFirstPassAttempts: RecentAttemptSnapshot[];

  // Last N first-pass attempts within each retrieval modality. This is separate
  // from lifetime breakdown so Focused Practice addresses current difficulty.
  recentModalityEvidence: RecentModalityBreakdown;

  // Deterministic, explainable category
  classification: PracticeSignalCategory;

  // Transparent human-readable explanation
  explanationVi: string;
}

export interface SerializedPracticeEvidenceSummary
  extends Omit<PracticeEvidenceSummary, "lastPracticedAt" | "recentFirstPassAttempts" | "recentModalityEvidence"> {
  lastPracticedAt: string | null;
  recentFirstPassAttempts: Array<{
    attemptNumber: number;
    correct: boolean;
    questionType: string;
    responseMs: number | null;
    createdAt: string;
  }>;
  recentModalityEvidence: {
    typedRecall: Omit<RecentModalityEvidence, "latestFirstPassAt"> & { latestFirstPassAt: string | null };
    storyCloze: Omit<RecentModalityEvidence, "latestFirstPassAt"> & { latestFirstPassAt: string | null };
    multipleChoice: Omit<RecentModalityEvidence, "latestFirstPassAt"> & { latestFirstPassAt: string | null };
  };
}

export function serializePracticeEvidenceSummary(
  summary: PracticeEvidenceSummary
): SerializedPracticeEvidenceSummary {
  return {
    ...summary,
    lastPracticedAt: summary.lastPracticedAt ? summary.lastPracticedAt.toISOString() : null,
    recentFirstPassAttempts: summary.recentFirstPassAttempts.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
    recentModalityEvidence: serializeRecentModalityEvidence(summary.recentModalityEvidence),
  };
}

function serializeRecentModalityEvidence(
  evidence: RecentModalityBreakdown
): SerializedPracticeEvidenceSummary["recentModalityEvidence"] {
  const serialize = (modality: RecentModalityEvidence) => ({
    ...modality,
    latestFirstPassAt: modality.latestFirstPassAt?.toISOString() ?? null,
  });
  return {
    typedRecall: serialize(evidence.typedRecall),
    storyCloze: serialize(evidence.storyCloze),
    multipleChoice: serialize(evidence.multipleChoice),
  };
}

export type SmartPracticeSignalCode =
  | "RECENT_REPEATED_FAILURE"
  | "RECENT_FAILURE"
  | "HIGH_FAILURE_RATE"
  | "MIXED_EVIDENCE"
  | "OVERDUE"
  | "LOW_STABILITY"
  | "HIGH_LAPSES"
  | "SLOW_RESPONSE";

export interface CardFsrsSignals {
  due?: Date | null;
  state?: number;
  stability?: number;
  difficulty?: number;
  lapses?: number;
  reps?: number;
}

export interface NeedPracticeCardItem {
  card: {
    id: string;
    deckId: string;
    term: string;
    normalizedTerm: string;
    meaningVi: string;
    ipa?: string | null;
    partOfSpeech?: string | null;
    cefr?: string | null;
    status: string;
    definitionEn?: string | null;
    exampleEn?: string | null;
    exampleVi?: string | null;
    stability?: number;
    difficulty?: number;
    lapses?: number;
    reps?: number;
    due?: Date | null;
    state?: number;
    lastReviewAt?: Date | null;
  };
  summary: PracticeEvidenceSummary;
  priorityScore: number;
  signals?: SmartPracticeSignalCode[];
  signalReasonVi?: string;
}

export type MistakeFilter =
  | "ALL"
  | "NEEDS_PRACTICE"
  | "RECENT_MISTAKES"
  | "RESOLVED"
  | "TYPED"
  | "FILL_IN_BLANK"
  | "MULTIPLE_CHOICE"
  | "STORY_CLOZE"
  | "STORY_CONTEXTUAL_VOCAB";

export interface MistakeBankItem {
  id: string;
  flashcardId: string;
  term: string;
  normalizedTerm: string | null;
  meaningVi: string;
  ipa?: string | null;
  partOfSpeech?: string | null;
  definitionEn?: string | null;
  exampleEn?: string | null;
  exampleVi?: string | null;
  questionType: string;
  prompt: string | null;
  userAnswer: string;
  expectedAnswer: string;
  attemptNumber: number;
  responseMs: number | null;
  createdAt: Date;
  sessionId?: string | null;
  derivedStatus: "NEEDS_PRACTICE" | "IMPROVING" | "RESOLVED";
  statusExplanationVi: string;
  cardClassification: PracticeSignalCategory;
}

export interface SerializedMistakeBankItem extends Omit<MistakeBankItem, "createdAt"> {
  createdAt: string;
}

export interface DeckMistakesResult {
  mistakes: MistakeBankItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    all: number;
    needsPractice: number;
    resolved: number;
  };
}

export interface SerializedDeckMistakesResult extends Omit<DeckMistakesResult, "mistakes"> {
  mistakes: SerializedMistakeBankItem[];
}

export interface GetDeckMistakesOptions {
  page?: number;
  pageSize?: number;
  filter?: MistakeFilter;
}

/**
 * Centralized heuristic configuration.
 * Note: These are product heuristics for recency and stability, NOT scientifically optimal thresholds.
 */
export const EVIDENCE_CONFIG = {
  // Conservative small N for the recent first-pass window
  RECENT_WINDOW_SIZE: 5,
  // Minimum attempts required before a card can be considered stable (not insufficient data)
  MIN_STABLE_ATTEMPTS: 2,
  // Existing Phase 3A classification semantics, named here so graduation has
  // no separate or hidden rule.
  FAIL_RATIO_WEAK_THRESHOLD: 0.5,
  RECENT_SUCCESS_RATIO_THRESHOLD: 0.67,
  // Bounded session size for focused practice
  FOCUSED_PRACTICE_SESSION_LIMIT: 10,
} as const;

export const FOCUSED_PRACTICE_SESSION_LIMIT = EVIDENCE_CONFIG.FOCUSED_PRACTICE_SESSION_LIMIT;

/**
 * Pure function: Classifies practice signal into transparent categories based strictly on evidence.
 * Phase 3A.1 Hardening: Cards with fewer than MIN_STABLE_ATTEMPTS (e.g. 1 attempt) are strictly
 * INSUFFICIENT_DATA. They are never labeled as weak or NEEDS_PRACTICE.
 */
export function computeCardClassification(
  firstPassAttempts: number,
  recentFirstPass: RecentAttemptSnapshot[],
  retryCorrect: number,
  retryIncorrect: number,
  latestFirstPassCorrect: boolean | null
): { category: PracticeSignalCategory; explanationVi: string } {
  // 1. No evidence
  if (firstPassAttempts === 0) {
    return {
      category: "NO_EVIDENCE",
      explanationVi: "Chưa có dữ liệu luyện tập",
    };
  }

  // 2. Insufficient data: only 1 first-pass attempt (must never be classified as weak/NEEDS_PRACTICE)
  if (firstPassAttempts < EVIDENCE_CONFIG.MIN_STABLE_ATTEMPTS) {
    if (latestFirstPassCorrect === false) {
      if (retryCorrect > 0) {
        return {
          category: "INSUFFICIENT_DATA",
          explanationVi: "Mới có 1 lượt: sai lần đầu nhưng đã sửa đúng khi luyện lại (cần thêm dữ liệu)",
        };
      }
      if (retryIncorrect > 0) {
        return {
          category: "INSUFFICIENT_DATA",
          explanationVi: "Mới có 1 lượt kiểm tra (lần đầu và luyện lại chưa đúng, cần thêm dữ liệu)",
        };
      }
      return {
        category: "INSUFFICIENT_DATA",
        explanationVi: "Mới có 1 lượt kiểm tra (chưa chính xác, cần thêm dữ liệu)",
      };
    }
    return {
      category: "INSUFFICIENT_DATA",
      explanationVi: "Mới có 1 lượt kiểm tra (chính xác, cần thêm dữ liệu)",
    };
  }

  // 3. Evaluation within recent window (last N attempts)
  const windowCount = recentFirstPass.length;
  const recentCorrect = recentFirstPass.filter((a) => a.correct).length;
  const recentIncorrect = windowCount - recentCorrect;

  if (latestFirstPassCorrect === false) {
    // If the latest first-pass attempt was incorrect
    // Check if failure is predominant or if retry also failed
    if (recentIncorrect / windowCount >= EVIDENCE_CONFIG.FAIL_RATIO_WEAK_THRESHOLD || retryIncorrect > 0) {
      return {
        category: "NEEDS_PRACTICE",
        explanationVi: `Lần gần nhất chưa đúng (${recentIncorrect}/${windowCount} lần sai gần đây)`,
      };
    }
    return {
      category: "MIXED",
      explanationVi: `Lần gần nhất chưa đúng, nhưng tỷ lệ đúng trước đó khá (${recentCorrect}/${windowCount} lần gần đây)`,
    };
  }

  // Latest first-pass attempt was correct
  if (recentIncorrect === 0) {
    return {
      category: "RECENTLY_SUCCESSFUL",
      explanationVi: `Làm đúng ${recentCorrect}/${windowCount} lần gần đây`,
    };
  }

  if (recentCorrect / windowCount >= EVIDENCE_CONFIG.RECENT_SUCCESS_RATIO_THRESHOLD) {
    return {
      category: "RECENTLY_SUCCESSFUL",
      explanationVi: `Thực hành gần đây tiến bộ tốt (${recentCorrect}/${windowCount} đúng)`,
    };
  }

  return {
    category: "MIXED",
    explanationVi: `Kết quả chưa ổn định (${recentCorrect}/${windowCount} đúng gần đây)`,
  };
}

/**
 * Pure function: Combines Practice Evidence with FSRS Memory Evidence
 * to compute a deterministic, explainable priority score for Smart Practice.
 *
 * Base Retrieval Practice Tiers:
 * Tier 400: latest first-pass incorrect + retry also incorrect (RECENT_REPEATED_FAILURE)
 * Tier 300: latest first-pass incorrect (RECENT_FAILURE)
 * Tier 200: NEEDS_PRACTICE classification (HIGH_FAILURE_RATE)
 * Tier 100: MIXED classification (MIXED_EVIDENCE)
 *
 * FSRS Memory Decay Bonuses:
 * +60: Card is due or overdue (OVERDUE)
 * +35: Card has repeated memory lapses (lapses >= 2) (HIGH_LAPSES)
 * +25: Card has fragile memory stability (stability < 3.0) (LOW_STABILITY)
 * +15: Card had slow response time in recent incorrect attempts (SLOW_RESPONSE)
 */
export function computeSmartPracticePriority(
  summary: PracticeEvidenceSummary,
  fsrs?: CardFsrsSignals,
  now: Date = new Date()
): { priorityScore: number; signals: SmartPracticeSignalCode[]; signalReasonVi: string } {
  if (summary.classification === "NO_EVIDENCE" || summary.classification === "INSUFFICIENT_DATA") {
    return { priorityScore: 0, signals: [], signalReasonVi: summary.explanationVi };
  }

  const signals: SmartPracticeSignalCode[] = [];
  const reasonParts: string[] = [];

  const latestFirstPassWrong = summary.latestFirstPassCorrect === false;
  const retryAlsoWrong = summary.retryIncorrect > 0 && summary.retryAttempts > summary.retryCorrect;

  let baseScore = 10;
  if (latestFirstPassWrong && retryAlsoWrong) {
    baseScore = 400;
    signals.push("RECENT_REPEATED_FAILURE");
    reasonParts.push("Sai lần đầu và khi luyện lại");
  } else if (latestFirstPassWrong) {
    baseScore = 300;
    signals.push("RECENT_FAILURE");
    reasonParts.push("Lần gần nhất chưa đúng");
  } else if (summary.classification === "NEEDS_PRACTICE") {
    baseScore = 200;
    signals.push("HIGH_FAILURE_RATE");
    reasonParts.push("Tỷ lệ sai cao gần đây");
  } else if (summary.classification === "MIXED") {
    baseScore = 100;
    signals.push("MIXED_EVIDENCE");
    reasonParts.push("Kết quả chưa ổn định");
  }

  let fsrsBonus = 0;
  if (fsrs) {
    // 1. Overdue signal
    if (fsrs.state !== undefined && fsrs.state > 0 && fsrs.due && new Date(fsrs.due).getTime() <= now.getTime()) {
      fsrsBonus += 60;
      signals.push("OVERDUE");
      reasonParts.push("Quá hạn ôn FSRS");
    }

    // 2. High lapses signal
    if (fsrs.lapses !== undefined && fsrs.lapses >= 2) {
      fsrsBonus += 35;
      signals.push("HIGH_LAPSES");
      reasonParts.push(`Hay quên (${fsrs.lapses} lần lapse)`);
    }

    // 3. Low stability signal
    if (
      fsrs.state !== undefined &&
      fsrs.state > 0 &&
      fsrs.stability !== undefined &&
      fsrs.stability > 0 &&
      fsrs.stability < 3.0
    ) {
      fsrsBonus += 25;
      signals.push("LOW_STABILITY");
      reasonParts.push("Trí nhớ mong manh");
    }
  }

  // 4. Slow response time in recent failures
  if (summary.recentFirstPassAttempts.length > 0) {
    const wrongAttempts = summary.recentFirstPassAttempts.filter((a) => !a.correct && a.responseMs);
    if (wrongAttempts.length > 0) {
      const avgMs = wrongAttempts.reduce((sum, a) => sum + (a.responseMs ?? 0), 0) / wrongAttempts.length;
      if (avgMs > 8000) {
        fsrsBonus += 15;
        signals.push("SLOW_RESPONSE");
        reasonParts.push("Phản xạ chậm");
      }
    }
  }

  const priorityScore = baseScore + fsrsBonus;
  const signalReasonVi = reasonParts.join(" • ") || summary.explanationVi;

  return { priorityScore, signals, signalReasonVi };
}

/**
 * Pure function: Deterministic priority key for sorting "Cần luyện thêm" (highest priority first).
 */
export function getNeedPracticePriority(summary: PracticeEvidenceSummary): number {
  if (summary.classification === "NO_EVIDENCE" || summary.classification === "INSUFFICIENT_DATA") {
    return 0;
  }
  return computeSmartPracticePriority(summary).priorityScore;
}

/**
 * Pure function: Aggregates raw PracticeAttempt records for a single flashcard.
 */
export function aggregateCardPracticeEvidence(
  flashcardId: string,
  rawAttempts: PracticeAttempt[]
): PracticeEvidenceSummary {
  // Sort attempts chronologically ascending
  const attempts = [...rawAttempts].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let firstPassAttempts = 0;
  let firstPassCorrect = 0;
  let firstPassIncorrect = 0;

  let retryAttempts = 0;
  let retryCorrect = 0;
  let retryIncorrect = 0;

  let latestFirstPassCorrect: boolean | null = null;
  let lastPracticedAt: Date | null = null;

  const breakdown: QuestionTypeBreakdown = {
    typedRecall: { attempts: 0, correct: 0, incorrect: 0 },
    storyCloze: { attempts: 0, correct: 0, incorrect: 0 },
    multipleChoice: { attempts: 0, correct: 0, incorrect: 0 },
    other: { attempts: 0, correct: 0, incorrect: 0 },
  };

  const firstPassList: RecentAttemptSnapshot[] = [];
  const firstPassByModality = {
    typedRecall: [] as RecentAttemptSnapshot[],
    storyCloze: [] as RecentAttemptSnapshot[],
    multipleChoice: [] as RecentAttemptSnapshot[],
  };

  for (const a of attempts) {
    const isFirstPass = (a.attemptNumber ?? 1) === 1;
    const isRetry = a.attemptNumber === 2;

    lastPracticedAt = new Date(a.createdAt);

    // Map question types
    let targetCategory: QuestionTypeEvidence;
    let modalityKey: keyof typeof firstPassByModality | null = null;
    if (a.questionType === "typed_vi_en") {
      targetCategory = breakdown.typedRecall;
      modalityKey = "typedRecall";
    } else if (a.questionType === "story_cloze") {
      targetCategory = breakdown.storyCloze;
      modalityKey = "storyCloze";
    } else if (
      a.questionType === "multiple_choice" ||
      a.questionType.startsWith("multiple_choice") ||
      a.questionType === "fill_in_blank" ||
      a.questionType === "story_contextual_vocab"
    ) {
      targetCategory = breakdown.multipleChoice;
      modalityKey = "multipleChoice";
    } else {
      targetCategory = breakdown.other;
    }

    // Accumulate question type breakdown
    targetCategory.attempts += 1;
    if (a.correct) {
      targetCategory.correct += 1;
    } else {
      targetCategory.incorrect += 1;
    }

    if (isFirstPass) {
      firstPassAttempts += 1;
      if (a.correct) {
        firstPassCorrect += 1;
      } else {
        firstPassIncorrect += 1;
      }
      latestFirstPassCorrect = a.correct;
      const snapshot = {
        attemptNumber: 1,
        correct: a.correct,
        questionType: a.questionType,
        responseMs: a.responseMs,
        createdAt: new Date(a.createdAt),
      };
      firstPassList.push(snapshot);
      if (modalityKey) firstPassByModality[modalityKey].push(snapshot);
    } else if (isRetry) {
      retryAttempts += 1;
      if (a.correct) {
        retryCorrect += 1;
      } else {
        retryIncorrect += 1;
      }
    }
  }

  // Get last N first-pass attempts
  const recentFirstPassAttempts = firstPassList.slice(-EVIDENCE_CONFIG.RECENT_WINDOW_SIZE);
  const summarizeRecentModality = (attempts: RecentAttemptSnapshot[]): RecentModalityEvidence => {
    const recent = attempts.slice(-EVIDENCE_CONFIG.RECENT_WINDOW_SIZE);
    const correct = recent.filter((attempt) => attempt.correct).length;
    return {
      attempts: recent.length,
      correct,
      incorrect: recent.length - correct,
      latestFirstPassCorrect: recent.at(-1)?.correct ?? null,
      latestFirstPassAt: recent.at(-1)?.createdAt ?? null,
    };
  };
  const recentModalityEvidence: RecentModalityBreakdown = {
    typedRecall: summarizeRecentModality(firstPassByModality.typedRecall),
    storyCloze: summarizeRecentModality(firstPassByModality.storyCloze),
    multipleChoice: summarizeRecentModality(firstPassByModality.multipleChoice),
  };

  // Determine classification
  const { category, explanationVi } = computeCardClassification(
    firstPassAttempts,
    recentFirstPassAttempts,
    retryCorrect,
    retryIncorrect,
    latestFirstPassCorrect
  );

  return {
    flashcardId,
    firstPassAttempts,
    firstPassCorrect,
    firstPassIncorrect,
    retryAttempts,
    retryCorrect,
    retryIncorrect,
    latestFirstPassCorrect,
    lastPracticedAt,
    breakdownByQuestionType: breakdown,
    recentFirstPassAttempts,
    recentModalityEvidence,
    classification: category,
    explanationVi,
  };
}

export class PracticeEvidenceService {
  /**
   * Fetches and aggregates practice evidence for a single flashcard.
   */
  async getFlashcardEvidenceSummary(flashcardId: string): Promise<PracticeEvidenceSummary> {
    const attempts = await db.practiceAttempt.findMany({
      where: { flashcardId },
      orderBy: { createdAt: "asc" },
    });

    return aggregateCardPracticeEvidence(flashcardId, attempts);
  }

  /**
   * Fetches and aggregates practice evidence for all cards in a deck in a single batched query.
   * Guarantees 0 N+1 queries.
   */
  async getDeckPracticeEvidence(deckId: string): Promise<{
    summaries: Map<string, PracticeEvidenceSummary>;
    needPracticeCards: NeedPracticeCardItem[];
    counts: Record<PracticeSignalCategory, number>;
  }> {
    // 1. Fetch cards for this deck
    const cards = await db.flashcard.findMany({
      where: { deckId },
      select: {
        id: true,
        deckId: true,
        term: true,
        normalizedTerm: true,
        meaningVi: true,
        ipa: true,
        partOfSpeech: true,
        cefr: true,
        status: true,
        definitionEn: true,
        exampleEn: true,
        exampleVi: true,
        stability: true,
        difficulty: true,
        lapses: true,
        reps: true,
        due: true,
        state: true,
        lastReviewAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (cards.length === 0) {
      return {
        summaries: new Map(),
        needPracticeCards: [],
        counts: {
          NO_EVIDENCE: 0,
          INSUFFICIENT_DATA: 0,
          NEEDS_PRACTICE: 0,
          MIXED: 0,
          RECENTLY_SUCCESSFUL: 0,
        },
      };
    }

    const cardIds = cards.map((c) => c.id);

    // 2. Fetch all practice attempts for these cards in a single query leveraging @@index([flashcardId, createdAt])
    const allAttempts = await db.practiceAttempt.findMany({
      where: { flashcardId: { in: cardIds } },
      orderBy: { createdAt: "asc" },
    });

    // 3. Group attempts by flashcardId
    const attemptsByCardId = new Map<string, PracticeAttempt[]>();
    for (const a of allAttempts) {
      const list = attemptsByCardId.get(a.flashcardId) ?? [];
      list.push(a);
      attemptsByCardId.set(a.flashcardId, list);
    }

    const summaries = new Map<string, PracticeEvidenceSummary>();
    const needPracticeCards: NeedPracticeCardItem[] = [];
    const counts: Record<PracticeSignalCategory, number> = {
      NO_EVIDENCE: 0,
      INSUFFICIENT_DATA: 0,
      NEEDS_PRACTICE: 0,
      MIXED: 0,
      RECENTLY_SUCCESSFUL: 0,
    };

    // 4. Compute summaries
    for (const card of cards) {
      const cardAttempts = attemptsByCardId.get(card.id) ?? [];
      const summary = aggregateCardPracticeEvidence(card.id, cardAttempts);
      summaries.set(card.id, summary);
      counts[summary.classification] += 1;

      // Candidates for "Cần luyện thêm" are STRICTLY actual evidence: NEEDS_PRACTICE and MIXED
      // INSUFFICIENT_DATA and NO_EVIDENCE are excluded.
      if (
        summary.classification === "NEEDS_PRACTICE" ||
        summary.classification === "MIXED"
      ) {
        const { priorityScore, signals, signalReasonVi } = computeSmartPracticePriority(
          summary,
          {
            due: card.due,
            state: card.state,
            stability: card.stability,
            difficulty: card.difficulty,
            lapses: card.lapses,
            reps: card.reps,
          }
        );
        needPracticeCards.push({
          card,
          summary,
          priorityScore,
          signals,
          signalReasonVi,
        });
      }
    }

    // 5. Deterministic sorting for "Cần luyện thêm"
    needPracticeCards.sort((a, b) => {
      // Primary: Priority Tier descending
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }

      // Secondary: Failure ratio in recent window descending
      const aFailRatio =
        a.summary.recentFirstPassAttempts.length > 0
          ? a.summary.recentFirstPassAttempts.filter((x) => !x.correct).length /
            a.summary.recentFirstPassAttempts.length
          : 0;
      const bFailRatio =
        b.summary.recentFirstPassAttempts.length > 0
          ? b.summary.recentFirstPassAttempts.filter((x) => !x.correct).length /
            b.summary.recentFirstPassAttempts.length
          : 0;
      if (bFailRatio !== aFailRatio) {
        return bFailRatio - aFailRatio;
      }

      // Tertiary: Most recently practiced first
      const aTime = a.summary.lastPracticedAt?.getTime() ?? 0;
      const bTime = b.summary.lastPracticedAt?.getTime() ?? 0;
      if (bTime !== aTime) {
        return bTime - aTime;
      }

      // Quaternary: Deterministic tie-breaker by term alphabetical
      return a.card.term.localeCompare(b.card.term);
    });

    return {
      summaries,
      needPracticeCards,
      counts,
    };
  }

  /**
   * Selects candidate cards for Focused Practice (Phase 3B).
   * - Candidates are drawn exclusively from NEEDS_PRACTICE and MIXED (NO_EVIDENCE and INSUFFICIENT_DATA excluded).
   * - Sorted by deterministic priority tiers (Tier 400 > 300 > 200 > 100).
   * - Bounded to limit (default 10).
   * - Maximum 1 initial question per card (no repeated hammering).
   * - Deterministically determines targetQuestionType and transparent selectionReason.
   */
  async getFocusedPracticeCandidates(
    deckId: string,
    limit: number = FOCUSED_PRACTICE_SESSION_LIMIT
  ): Promise<FocusedPracticeCandidate[]> {
    const { needPracticeCards } = await this.getDeckPracticeEvidence(deckId);

    // Bounded to session limit (cards are already distinct, at most one per card)
    const topCandidates = needPracticeCards.slice(0, limit);
    if (topCandidates.length === 0) {
      return [];
    }

    // Inspect stories in this deck to verify which cards have valid sentence cloze context
    const stories = await db.story.findMany({
      where: { deckId },
      orderBy: { createdAt: "desc" },
    });

    const cardsWithStoryContext = new Set<string>();
    const cardByTerm = new Map<string, string>(); // lowerTerm -> cardId
    for (const c of topCandidates) {
      cardByTerm.set(c.card.term.trim().toLowerCase(), c.card.id);
      if (c.card.normalizedTerm) {
        cardByTerm.set(c.card.normalizedTerm.trim().toLowerCase(), c.card.id);
      }
    }

    for (const story of stories) {
      const vocab = normalizeStoryVocabulary(story.targetWords);
      if (!vocab.usage) continue;
      for (const u of vocab.usage) {
        const t = u.term?.trim().toLowerCase();
        const usedAs = u.usedAs?.trim();
        if (t && usedAs && cardByTerm.has(t)) {
          const cardId = cardByTerm.get(t)!;
          if (extractSentenceContainingUsageWithBoundary(story.content, usedAs)) {
            cardsWithStoryContext.add(cardId);
          }
        }
      }
    }

    return topCandidates.map(({ card, summary, priorityScore, signals, signalReasonVi }) => {
      const hasStory = cardsWithStoryContext.has(card.id);
      const modeSelection = selectPracticeMode(card, summary, { hasStoryContext: hasStory });
      return {
        card,
        summary,
        priorityScore,
        signals,
        signalReasonVi,
        targetQuestionType: modeSelection.targetQuestionType,
        selectionReason: modeSelection.selectionReason,
      };
    });
  }

  /**
   * Retrieves paginated mistake bank items for a deck.
   * Derived from immutable PracticeAttempt (correct === false, attemptNumber === 1).
   * Status (NEEDS_PRACTICE, IMPROVING, RESOLVED) is derived from subsequent evidence.
   */
  async getDeckMistakes(
    deckId: string,
    options: GetDeckMistakesOptions = {}
  ): Promise<DeckMistakesResult> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, Math.min(50, options.pageSize ?? 10));
    const filter = options.filter ?? "ALL";

    // 1. Get current practice summaries for all cards in this deck to derive current status
    const { summaries } = await this.getDeckPracticeEvidence(deckId);

    // 2. Build where filter for PracticeAttempt
    const baseWhere: Prisma.PracticeAttemptWhereInput = {
      flashcard: { deckId },
      correct: false,
      attemptNumber: 1,
    };

    if (filter === "TYPED") {
      baseWhere.questionType = "typed_vi_en";
    } else if (filter === "FILL_IN_BLANK") {
      baseWhere.questionType = "fill_in_blank";
    } else if (filter === "MULTIPLE_CHOICE") {
      baseWhere.questionType = { in: ["multiple_choice_en_vi", "multiple_choice_vi_en"] };
    } else if (filter === "STORY_CLOZE") {
      baseWhere.questionType = "story_cloze";
    } else if (filter === "STORY_CONTEXTUAL_VOCAB") {
      baseWhere.questionType = "story_contextual_vocab";
    } else if (filter === "RECENT_MISTAKES") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      baseWhere.createdAt = { gte: sevenDaysAgo };
    } else if (filter === "NEEDS_PRACTICE") {
      const matchingCardIds: string[] = [];
      for (const [cardId, summary] of summaries.entries()) {
        if (summary.classification === "NEEDS_PRACTICE" || summary.classification === "INSUFFICIENT_DATA") {
          matchingCardIds.push(cardId);
        }
      }
      baseWhere.flashcardId = { in: matchingCardIds };
    } else if (filter === "RESOLVED") {
      const matchingCardIds: string[] = [];
      for (const [cardId, summary] of summaries.entries()) {
        if (summary.classification === "RECENTLY_SUCCESSFUL") {
          matchingCardIds.push(cardId);
        }
      }
      baseWhere.flashcardId = { in: matchingCardIds };
    }

    // 3. Count total for current query
    const total = await db.practiceAttempt.count({ where: baseWhere });

    // 4. Compute counts for tabs
    const allAttemptsCount = await db.practiceAttempt.count({
      where: {
        flashcard: { deckId },
        correct: false,
        attemptNumber: 1,
      },
    });

    const needsPracticeCardIds: string[] = [];
    const resolvedCardIds: string[] = [];
    for (const [cardId, summary] of summaries.entries()) {
      if (summary.classification === "NEEDS_PRACTICE" || summary.classification === "INSUFFICIENT_DATA") {
        needsPracticeCardIds.push(cardId);
      } else if (summary.classification === "RECENTLY_SUCCESSFUL") {
        resolvedCardIds.push(cardId);
      }
    }

    const [needsPracticeCount, resolvedCount] = await Promise.all([
      needsPracticeCardIds.length > 0
        ? db.practiceAttempt.count({
            where: {
              flashcardId: { in: needsPracticeCardIds },
              correct: false,
              attemptNumber: 1,
            },
          })
        : 0,
      resolvedCardIds.length > 0
        ? db.practiceAttempt.count({
            where: {
              flashcardId: { in: resolvedCardIds },
              correct: false,
              attemptNumber: 1,
            },
          })
        : 0,
    ]);

    // 5. Query paginated attempts
    const attempts = await db.practiceAttempt.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        flashcard: true,
      },
    });

    const mistakes: MistakeBankItem[] = attempts.map((att) => {
      const summary = summaries.get(att.flashcardId);
      let derivedStatus: "NEEDS_PRACTICE" | "IMPROVING" | "RESOLVED" = "NEEDS_PRACTICE";
      const statusExplanationVi = summary?.explanationVi ?? "Cần thêm lượt luyện tập";

      if (summary) {
        if (summary.classification === "RECENTLY_SUCCESSFUL") {
          derivedStatus = "RESOLVED";
        } else if (summary.classification === "MIXED") {
          derivedStatus = "IMPROVING";
        } else {
          derivedStatus = "NEEDS_PRACTICE";
        }
      }

      return {
        id: att.id,
        flashcardId: att.flashcardId,
        term: att.flashcard.term,
        normalizedTerm: att.flashcard.normalizedTerm,
        meaningVi: att.flashcard.meaningVi,
        ipa: att.flashcard.ipa,
        partOfSpeech: att.flashcard.partOfSpeech,
        definitionEn: att.flashcard.definitionEn,
        exampleEn: att.flashcard.exampleEn,
        exampleVi: att.flashcard.exampleVi,
        questionType: att.questionType,
        prompt: att.prompt,
        userAnswer: att.answer,
        expectedAnswer: att.expectedAnswer,
        attemptNumber: att.attemptNumber,
        responseMs: att.responseMs,
        createdAt: att.createdAt,
        sessionId: att.sessionId,
        derivedStatus,
        statusExplanationVi,
        cardClassification: summary?.classification ?? "NO_EVIDENCE",
      };
    });

    return {
      mistakes,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      counts: {
        all: allAttemptsCount,
        needsPractice: needsPracticeCount,
        resolved: resolvedCount,
      },
    };
  }
}

export type TargetedPracticeMode =
  | "typed_vi_en"
  | "story_cloze"
  | "multiple_choice_vi_en"
  | "multiple_choice_en_vi"
  | "fill_in_blank";

export interface PracticeModeSelection {
  targetQuestionType: TargetedPracticeMode;
  selectionReason: string;
}

export interface FocusedPracticeCandidate {
  card: {
    id: string;
    deckId: string;
    term: string;
    normalizedTerm: string | null;
    meaningVi: string;
    definitionEn?: string | null;
    ipa?: string | null;
    partOfSpeech?: string | null;
    exampleEn?: string | null;
    exampleVi?: string | null;
    cefr?: string | null;
    status: string;
  };
  summary: PracticeEvidenceSummary;
  priorityScore: number;
  signals?: SmartPracticeSignalCode[];
  signalReasonVi?: string;
  targetQuestionType: TargetedPracticeMode;
  selectionReason: string;
}

/**
 * Pure deterministic helper: selects targeted practice mode based on transparent evidence.
 * Concept:
 * 1. If active recall (typed_vi_en) shows clear failure -> typed_vi_en
 * 2. Else if historical story_cloze shows clear failure, use typed_vi_en.
 *    Story Cloze is parked as an active mode, but its evidence remains meaningful.
 * 3. Else if only recognition (multipleChoice) shows failure -> multiple_choice_vi_en (or fill_in_blank)
 * 4. General fallback -> typed_vi_en (active recall default)
 */
export function selectPracticeMode(
  card: { term: string; meaningVi: string; exampleEn?: string | null },
  summary: PracticeEvidenceSummary,
  _capabilities: { hasStoryContext: boolean }
): PracticeModeSelection {
  // Kept in the public helper signature so historical callers remain compatible.
  void _capabilities;
  const modalities = [
    { kind: "typed" as const, label: "Gõ từ", evidence: summary.recentModalityEvidence.typedRecall },
    { kind: "story" as const, label: "Story Cloze", evidence: summary.recentModalityEvidence.storyCloze },
    { kind: "multipleChoice" as const, label: "Trắc nghiệm", evidence: summary.recentModalityEvidence.multipleChoice },
  ].filter((modality) => modality.evidence.incorrect > 0);

  // A modality whose latest first-pass was wrong is more current than an older
  // error in another modality. Within that set, failure ratio and timestamp make
  // the tie-break deterministic without introducing any new threshold.
  const currentFailures = modalities.filter((modality) => modality.evidence.latestFirstPassCorrect === false);
  const prioritized = (currentFailures.length > 0 ? currentFailures : modalities).toSorted((a, b) => {
    const aRatio = a.evidence.incorrect / a.evidence.attempts;
    const bRatio = b.evidence.incorrect / b.evidence.attempts;
    if (bRatio !== aRatio) return bRatio - aRatio;
    const aTime = a.evidence.latestFirstPassAt?.getTime() ?? 0;
    const bTime = b.evidence.latestFirstPassAt?.getTime() ?? 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.kind.localeCompare(b.kind);
  });
  const selected = prioritized[0];

  if (selected?.kind === "story") {
    const { incorrect, attempts } = selected.evidence;
    return {
      targetQuestionType: "typed_vi_en",
      selectionReason: `Từng sai khi điền từ trong truyện (${incorrect}/${attempts}); củng cố bằng Gõ từ`,
    };
  }

  if (selected?.kind === "multipleChoice") {
    const { incorrect, attempts } = selected.evidence;
    if (card.exampleEn && card.exampleEn.length > 5) {
      return {
        targetQuestionType: "fill_in_blank",
        selectionReason: `Trắc nghiệm: ${incorrect}/${attempts} lần chưa đúng gần đây (luyện điền từ vào câu)`,
      };
    }
    return {
      targetQuestionType: "multiple_choice_vi_en",
      selectionReason: `Trắc nghiệm: ${incorrect}/${attempts} lần chưa đúng gần đây`,
    };
  }

  if (selected?.kind === "typed") {
    const { incorrect, attempts } = selected.evidence;
    return {
      targetQuestionType: "typed_vi_en",
      selectionReason: `Gõ từ: ${incorrect}/${attempts} lần chưa đúng gần đây`,
    };
  }

  // 4. Default active recall fallback for other NEEDS_PRACTICE / MIXED cards
  const defaultReason =
    summary.classification === "NEEDS_PRACTICE"
      ? "Lần làm bài gần nhất chưa đúng, luyện lại dạng Gõ từ"
      : "Kết quả chưa ổn định, củng cố bằng dạng Gõ từ";

  return {
    targetQuestionType: "typed_vi_en",
    selectionReason: defaultReason,
  };
}

export const practiceEvidenceService = new PracticeEvidenceService();
