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
  sessionId?: string;
  questionId?: string | null;
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

/**
 * Primary practice evidence axes separating passive recognition from active production.
 */
export type PracticeEvidenceAxis = "recognition" | "production";

export type AxisEvidenceState =
  | "NO_EVIDENCE"
  | "INSUFFICIENT_DATA"
  | "NEEDS_PRACTICE"
  | "MIXED"
  | "STRONG";

/**
 * Pure helper: Determines if an axis state represents confirmed weakness.
 * Only NEEDS_PRACTICE and MIXED qualify. NO_EVIDENCE and INSUFFICIENT_DATA are strictly not weak.
 */
export function isWeakAxis(state: AxisEvidenceState): boolean {
  return state === "NEEDS_PRACTICE" || state === "MIXED";
}

/**
 * Pure helper: Determines if a card is weak based strictly on multi-axis evidence.
 * A card is weak if and only if either its Recognition axis OR its Production axis is weak.
 * Legacy summary.classification is NEVER used to determine weakness.
 */
export function isWeakCardSummary(summary: {
  recognitionAxis: { state: AxisEvidenceState };
  productionAxis: { state: AxisEvidenceState };
}): boolean {
  return isWeakAxis(summary.recognitionAxis.state) || isWeakAxis(summary.productionAxis.state);
}

/**
 * Maps a question type to its authoritative primary practice evidence axis.
 * Non-vocabulary or whole-story tasks return null and must not pollute vocabulary evidence.
 */
export function getPracticeEvidenceAxis(
  questionType: string
): PracticeEvidenceAxis | null {
  switch (questionType) {
    case "multiple_choice":
    case "multiple_choice_en_vi":
    case "multiple_choice_vi_en":
    case "fill_in_blank":
    case "story_contextual_vocab":
      return "recognition";
    case "typed_vi_en":
    case "story_cloze":
      return "production";
    case "story_comprehension":
    default:
      return null;
  }
}

export interface PracticeAxisSummary {
  axis: PracticeEvidenceAxis;
  state: AxisEvidenceState;

  // 1. LIFETIME TOTALS (Authoritative history of this axis)
  lifetimeFirstPassAttempts: number;
  lifetimeFirstPassCorrect: number;
  lifetimeFirstPassIncorrect: number;
  lifetimeRetryAttempts: number;
  lifetimeRetryCorrect: number;
  lifetimeRetryIncorrect: number;

  // 2. RECENT WINDOW TOTALS (Bounded window N <= 5 of this axis)
  recentFirstPassAttempts: RecentAttemptSnapshot[];
  recentAttemptsCount: number;
  recentCorrectCount: number;
  recentIncorrectCount: number;

  // 3. RECENCY INDICATORS
  latestFirstPassCorrect: boolean | null;
  lastFirstPassAt: Date | null;
  latestFirstPassMatchingRetryCorrect: boolean | null;

  explanationVi: string;
}

export interface SerializedPracticeAxisSummary
  extends Omit<PracticeAxisSummary, "lastFirstPassAt" | "recentFirstPassAttempts"> {
  lastFirstPassAt: string | null;
  recentFirstPassAttempts: Array<{
    attemptNumber: number;
    correct: boolean;
    questionType: string;
    responseMs: number | null;
    createdAt: string;
  }>;
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
  lastFirstPassAt: Date | null;
  latestFirstPassMatchingRetryCorrect: boolean | null;

  // Question-type breakdown (must stay strictly separate, no numeric weighting)
  breakdownByQuestionType: QuestionTypeBreakdown;

  // Recent first-pass window (last N attempts per card)
  recentFirstPassAttempts: RecentAttemptSnapshot[];

  // Last N first-pass attempts within each retrieval modality. This is separate
  // from lifetime breakdown so Focused Practice addresses current difficulty.
  recentModalityEvidence: RecentModalityBreakdown;

  // Deterministic, explainable category (Legacy overall classification)
  classification: PracticeSignalCategory;

  // Transparent human-readable explanation
  explanationVi: string;

  // Multi-Axis Practice Evidence (Phase 2B)
  recognitionAxis: PracticeAxisSummary;
  productionAxis: PracticeAxisSummary;
}

export interface SerializedPracticeEvidenceSummary
  extends Omit<
    PracticeEvidenceSummary,
    | "lastPracticedAt"
    | "lastFirstPassAt"
    | "recentFirstPassAttempts"
    | "recentModalityEvidence"
    | "recognitionAxis"
    | "productionAxis"
  > {
  lastPracticedAt: string | null;
  lastFirstPassAt: string | null;
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
  recognitionAxis: SerializedPracticeAxisSummary;
  productionAxis: SerializedPracticeAxisSummary;
}

export function serializePracticeAxisSummary(
  axis: PracticeAxisSummary
): SerializedPracticeAxisSummary {
  return {
    ...axis,
    lastFirstPassAt: axis.lastFirstPassAt ? axis.lastFirstPassAt.toISOString() : null,
    recentFirstPassAttempts: axis.recentFirstPassAttempts.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export function serializePracticeEvidenceSummary(
  summary: PracticeEvidenceSummary
): SerializedPracticeEvidenceSummary {
  return {
    ...summary,
    lastPracticedAt: summary.lastPracticedAt ? summary.lastPracticedAt.toISOString() : null,
    lastFirstPassAt: summary.lastFirstPassAt ? summary.lastFirstPassAt.toISOString() : null,
    recentFirstPassAttempts: summary.recentFirstPassAttempts.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
    recentModalityEvidence: serializeRecentModalityEvidence(summary.recentModalityEvidence),
    recognitionAxis: serializePracticeAxisSummary(summary.recognitionAxis),
    productionAxis: serializePracticeAxisSummary(summary.productionAxis),
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

export interface WindowClassificationInput {
  firstPassAttempts: number;
  recentFirstPass: RecentAttemptSnapshot[];
  retryCorrect: number;
  retryIncorrect: number;
  latestFirstPassCorrect: boolean | null;
}

/**
 * Pure helper: Classifies a practice window into deterministic AxisEvidenceState.
 * Reused for:
 * 1. Recognition Window
 * 2. Production Window
 * 3. Legacy Overall Window (mapped to PracticeSignalCategory)
 */
export function classifyPracticeWindow(
  input: WindowClassificationInput
): { state: AxisEvidenceState; explanationVi: string } {
  const {
    firstPassAttempts,
    recentFirstPass,
    retryCorrect,
    retryIncorrect,
    latestFirstPassCorrect,
  } = input;

  // 1. No evidence
  if (firstPassAttempts === 0) {
    return {
      state: "NO_EVIDENCE",
      explanationVi: "Chưa có dữ liệu luyện tập",
    };
  }

  // 2. Insufficient data: only 1 first-pass attempt (must never be labeled weak)
  if (firstPassAttempts < EVIDENCE_CONFIG.MIN_STABLE_ATTEMPTS) {
    if (latestFirstPassCorrect === false) {
      if (retryCorrect > 0) {
        return {
          state: "INSUFFICIENT_DATA",
          explanationVi: "Mới có 1 lượt: sai lần đầu nhưng đã sửa đúng khi luyện lại (cần thêm dữ liệu)",
        };
      }
      if (retryIncorrect > 0) {
        return {
          state: "INSUFFICIENT_DATA",
          explanationVi: "Mới có 1 lượt kiểm tra (lần đầu và luyện lại chưa đúng, cần thêm dữ liệu)",
        };
      }
      return {
        state: "INSUFFICIENT_DATA",
        explanationVi: "Mới có 1 lượt kiểm tra (chưa chính xác, cần thêm dữ liệu)",
      };
    }
    return {
      state: "INSUFFICIENT_DATA",
      explanationVi: "Mới có 1 lượt kiểm tra (chính xác, cần thêm dữ liệu)",
    };
  }

  // 3. Evaluation within recent window (last N attempts)
  const windowCount = recentFirstPass.length;
  const recentCorrect = recentFirstPass.filter((a) => a.correct).length;
  const recentIncorrect = windowCount - recentCorrect;

  if (latestFirstPassCorrect === false) {
    // If the latest first-pass attempt was incorrect
    if (recentIncorrect / windowCount >= EVIDENCE_CONFIG.FAIL_RATIO_WEAK_THRESHOLD || retryIncorrect > 0) {
      return {
        state: "NEEDS_PRACTICE",
        explanationVi: `Lần gần nhất chưa đúng (${recentIncorrect}/${windowCount} lần sai gần đây)`,
      };
    }
    return {
      state: "MIXED",
      explanationVi: `Lần gần nhất chưa đúng, nhưng tỷ lệ đúng trước đó khá (${recentCorrect}/${windowCount} lần gần đây)`,
    };
  }

  // Latest first-pass attempt was correct
  if (recentIncorrect === 0) {
    return {
      state: "STRONG",
      explanationVi: `Làm đúng ${recentCorrect}/${windowCount} lần gần đây`,
    };
  }

  if (recentCorrect / windowCount >= EVIDENCE_CONFIG.RECENT_SUCCESS_RATIO_THRESHOLD) {
    return {
      state: "STRONG",
      explanationVi: `Thực hành gần đây tiến bộ tốt (${recentCorrect}/${windowCount} đúng)`,
    };
  }

  return {
    state: "MIXED",
    explanationVi: `Kết quả chưa ổn định (${recentCorrect}/${windowCount} đúng gần đây)`,
  };
}

/**
 * Pure function: Classifies practice signal into transparent categories based strictly on evidence.
 * Phase 3A.1 Hardening: Cards with fewer than MIN_STABLE_ATTEMPTS (e.g. 1 attempt) are strictly
 * INSUFFICIENT_DATA. They are never labeled as weak or NEEDS_PRACTICE.
 * Legacy wrapper around classifyPracticeWindow (maps STRONG -> RECENTLY_SUCCESSFUL).
 */
export function computeCardClassification(
  firstPassAttempts: number,
  recentFirstPass: RecentAttemptSnapshot[],
  retryCorrect: number,
  retryIncorrect: number,
  latestFirstPassCorrect: boolean | null
): { category: PracticeSignalCategory; explanationVi: string } {
  const result = classifyPracticeWindow({
    firstPassAttempts,
    recentFirstPass,
    retryCorrect,
    retryIncorrect,
    latestFirstPassCorrect,
  });

  const category: PracticeSignalCategory =
    result.state === "STRONG" ? "RECENTLY_SUCCESSFUL" : result.state;

  return {
    category,
    explanationVi: result.explanationVi,
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
/**
 * Pure helper: Computes the priority tier, signal code, and explanation for an axis.
 *
 * Tier Semantics (Phase 2B.3):
 * Tier 400: latest first-pass WRONG + matching retry of THAT SAME question/session WRONG (RECENT_REPEATED_FAILURE)
 * Tier 300: latest first-pass WRONG without matching retry failure (no retry yet / retry correct) (RECENT_FAILURE)
 * Tier 200: axis NEEDS_PRACTICE when latest first-pass was not wrong (HIGH_FAILURE_RATE)
 * Tier 100: axis MIXED (MIXED_EVIDENCE)
 */
export function getAxisPriorityTier(axis: PracticeAxisSummary): {
  tier: number;
  signal: SmartPracticeSignalCode;
  reason: string;
} {
  const latestFirstPassWrong = axis.latestFirstPassCorrect === false;
  const matchingRetryWrong = axis.latestFirstPassMatchingRetryCorrect === false;

  if (latestFirstPassWrong && matchingRetryWrong) {
    return {
      tier: 400,
      signal: "RECENT_REPEATED_FAILURE",
      reason: "Sai lần đầu và khi luyện lại",
    };
  }
  if (latestFirstPassWrong) {
    return {
      tier: 300,
      signal: "RECENT_FAILURE",
      reason: "Lần gần nhất chưa đúng",
    };
  }
  if (axis.state === "NEEDS_PRACTICE") {
    return {
      tier: 200,
      signal: "HIGH_FAILURE_RATE",
      reason: "Tỷ lệ sai cao gần đây",
    };
  }
  return {
    tier: 100,
    signal: "MIXED_EVIDENCE",
    reason: "Kết quả chưa ổn định",
  };
}

export function computeSmartPracticePriority(
  summary: PracticeEvidenceSummary,
  fsrs?: CardFsrsSignals,
  now: Date = new Date()
): { priorityScore: number; signals: SmartPracticeSignalCode[]; signalReasonVi: string } {
  const isWeak = isWeakCardSummary(summary);

  if (!isWeak) {
    return { priorityScore: 0, signals: [], signalReasonVi: summary.explanationVi };
  }

  const signals: SmartPracticeSignalCode[] = [];
  const reasonParts: string[] = [];

  const recogWeak = isWeakAxis(summary.recognitionAxis.state);
  const prodWeak = isWeakAxis(summary.productionAxis.state);

  let selected: { tier: number; signal: SmartPracticeSignalCode; reason: string };

  if (recogWeak && !prodWeak) {
    selected = getAxisPriorityTier(summary.recognitionAxis);
  } else if (prodWeak && !recogWeak) {
    selected = getAxisPriorityTier(summary.productionAxis);
  } else {
    // Both axes are weak: pick higher severity tier; tie prefers production
    const recogResult = getAxisPriorityTier(summary.recognitionAxis);
    const prodResult = getAxisPriorityTier(summary.productionAxis);
    selected = prodResult.tier >= recogResult.tier ? prodResult : recogResult;
  }

  const baseScore = selected.tier;
  signals.push(selected.signal);
  reasonParts.push(selected.reason);

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
  if (!isWeakCardSummary(summary)) {
    return 0;
  }
  return computeSmartPracticePriority(summary).priorityScore;
}

/**
 * Pure function: Aggregates raw PracticeAttempt records for a single flashcard.
 */
export interface CardPracticeLifetimeOverrides {
  firstPassAttempts: number;
  firstPassCorrect: number;
  firstPassIncorrect: number;
  retryAttempts: number;
  retryCorrect: number;
  retryIncorrect: number;
  recogFirstPassAttempts?: number;
  recogFirstPassCorrect?: number;
  recogFirstPassIncorrect?: number;
  recogRetryAttempts?: number;
  recogRetryCorrect?: number;
  recogRetryIncorrect?: number;
  prodFirstPassAttempts?: number;
  prodFirstPassCorrect?: number;
  prodFirstPassIncorrect?: number;
  prodRetryAttempts?: number;
  prodRetryCorrect?: number;
  prodRetryIncorrect?: number;
  breakdownByQuestionType?: QuestionTypeBreakdown;
}

/**
 * Pure helper: Finds the matching retry attempt (attemptNumber === 2) for a given first-pass attempt.
 *
 * Matching identity:
 * 1. Same flashcardId
 * 2. Same sessionId
 * 3. attemptNumber === 2
 * 4. Question identity:
 *    - If questionId is present on both: exact match (strongest identity).
 *    - Fallback for legacy fixtures where questionId is null: match by sessionId + flashcardId
 *      (where flashcard-in-session uniqueness invariant holds) and compatible retrieval axis.
 * 5. Created at or after the first-pass attempt.
 */
export interface RetryCorrelationAttempt {
  flashcardId: string;
  sessionId?: string;
  questionId?: string | null;
  questionType: string;
  attemptNumber: number;
  correct: boolean;
  createdAt: Date | string;
}

export function findMatchingRetryAttempt(
  firstPass: Pick<RetryCorrelationAttempt, "flashcardId" | "sessionId" | "questionId" | "questionType" | "createdAt">,
  allAttempts: RetryCorrelationAttempt[]
): RetryCorrelationAttempt | null {
  const fpAxis = getPracticeEvidenceAxis(firstPass.questionType);
  if (!fpAxis) return null;
  const fpTime = new Date(firstPass.createdAt).getTime();

  const found = allAttempts.find((att) => {
    if (att.attemptNumber !== 2) return false;
    if (att.flashcardId !== firstPass.flashcardId) return false;
    if (att.sessionId !== firstPass.sessionId) return false;

    // Check axis compatibility
    const attAxis = getPracticeEvidenceAxis(att.questionType);
    if (attAxis !== fpAxis) return false;

    // Retry must be created at or after the first-pass attempt
    const attTime = new Date(att.createdAt).getTime();
    if (attTime < fpTime) return false;

    // If both specify questionId, they must match (strongest identity)
    if (firstPass.questionId && att.questionId) {
      return att.questionId === firstPass.questionId;
    }

    // Safe fallback for legacy fixtures where questionId is null:
    // sessionId + flashcardId match satisfies the in-session uniqueness invariant
    return true;
  });

  return found ?? null;
}

/**
 * Pure function: Aggregates raw PracticeAttempt records for a single flashcard.
 * Computes:
 * 1. Recognition Axis summary (independent recent window & lifetime)
 * 2. Production Axis summary (independent recent window & lifetime)
 * 3. Legacy overall summary & classification (100% backward compatible)
 */
export function aggregateCardPracticeEvidence(
  flashcardId: string,
  rawAttempts: PracticeAttempt[],
  lifetime?: CardPracticeLifetimeOverrides
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
  let lastFirstPassAt: Date | null = null;
  let latestOverallFirstPassAttempt: PracticeAttempt | null = null;

  // Recognition Axis trackers
  let recogFirstPassCount = 0;
  let recogFirstPassCorrect = 0;
  let recogFirstPassIncorrect = 0;
  let recogRetryCount = 0;
  let recogRetryCorrect = 0;
  let recogRetryIncorrect = 0;
  let recogLatestFirstPassCorrect: boolean | null = null;
  let recogLastFirstPassAt: Date | null = null;
  let latestRecogFirstPassAttempt: PracticeAttempt | null = null;
  const recogFirstPassList: RecentAttemptSnapshot[] = [];

  // Production Axis trackers
  let prodFirstPassCount = 0;
  let prodFirstPassCorrect = 0;
  let prodFirstPassIncorrect = 0;
  let prodRetryCount = 0;
  let prodRetryCorrect = 0;
  let prodRetryIncorrect = 0;
  let prodLatestFirstPassCorrect: boolean | null = null;
  let prodLastFirstPassAt: Date | null = null;
  let latestProdFirstPassAttempt: PracticeAttempt | null = null;
  const prodFirstPassList: RecentAttemptSnapshot[] = [];

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
    if (isFirstPass) {
      lastFirstPassAt = new Date(a.createdAt);
    }

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

    const axis = getPracticeEvidenceAxis(a.questionType);

    if (isFirstPass) {
      firstPassAttempts += 1;
      if (a.correct) {
        firstPassCorrect += 1;
      } else {
        firstPassIncorrect += 1;
      }
      latestFirstPassCorrect = a.correct;
      latestOverallFirstPassAttempt = a;
      const snapshot: RecentAttemptSnapshot = {
        attemptNumber: 1,
        correct: a.correct,
        questionType: a.questionType,
        responseMs: a.responseMs,
        createdAt: new Date(a.createdAt),
        sessionId: a.sessionId,
        questionId: a.questionId,
      };
      firstPassList.push(snapshot);
      if (modalityKey) firstPassByModality[modalityKey].push(snapshot);

      if (axis === "recognition") {
        recogFirstPassCount += 1;
        if (a.correct) recogFirstPassCorrect += 1;
        else recogFirstPassIncorrect += 1;
        recogLatestFirstPassCorrect = a.correct;
        recogLastFirstPassAt = new Date(a.createdAt);
        latestRecogFirstPassAttempt = a;
        recogFirstPassList.push(snapshot);
      } else if (axis === "production") {
        prodFirstPassCount += 1;
        if (a.correct) prodFirstPassCorrect += 1;
        else prodFirstPassIncorrect += 1;
        prodLatestFirstPassCorrect = a.correct;
        prodLastFirstPassAt = new Date(a.createdAt);
        latestProdFirstPassAttempt = a;
        prodFirstPassList.push(snapshot);
      }
    } else if (isRetry) {
      retryAttempts += 1;
      if (a.correct) {
        retryCorrect += 1;
      } else {
        retryIncorrect += 1;
      }

      if (axis === "recognition") {
        recogRetryCount += 1;
        if (a.correct) recogRetryCorrect += 1;
        else recogRetryIncorrect += 1;
      } else if (axis === "production") {
        prodRetryCount += 1;
        if (a.correct) prodRetryCorrect += 1;
        else prodRetryIncorrect += 1;
      }
    }
  }

  // Windows
  const recentFirstPassAttempts = firstPassList.slice(-EVIDENCE_CONFIG.RECENT_WINDOW_SIZE);
  const recogRecentFirstPass = recogFirstPassList.slice(-EVIDENCE_CONFIG.RECENT_WINDOW_SIZE);
  const prodRecentFirstPass = prodFirstPassList.slice(-EVIDENCE_CONFIG.RECENT_WINDOW_SIZE);

  const summarizeRecentModality = (modAttempts: RecentAttemptSnapshot[]): RecentModalityEvidence => {
    const recent = modAttempts.slice(-EVIDENCE_CONFIG.RECENT_WINDOW_SIZE);
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

  // Correlation: identify matching retry for the latest first-pass failure
  let recogMatchingRetryCorrect: boolean | null = null;
  if (latestRecogFirstPassAttempt && latestRecogFirstPassAttempt.correct === false) {
    const matching = findMatchingRetryAttempt(latestRecogFirstPassAttempt, attempts);
    recogMatchingRetryCorrect = matching ? matching.correct : null;
  }

  let prodMatchingRetryCorrect: boolean | null = null;
  if (latestProdFirstPassAttempt && latestProdFirstPassAttempt.correct === false) {
    const matching = findMatchingRetryAttempt(latestProdFirstPassAttempt, attempts);
    prodMatchingRetryCorrect = matching ? matching.correct : null;
  }

  let overallMatchingRetryCorrect: boolean | null = null;
  if (latestOverallFirstPassAttempt && latestOverallFirstPassAttempt.correct === false) {
    const matching = findMatchingRetryAttempt(latestOverallFirstPassAttempt, attempts);
    overallMatchingRetryCorrect = matching ? matching.correct : null;
  }

  // Classify Recognition Axis
  const recogClassification = classifyPracticeWindow({
    firstPassAttempts: lifetime?.recogFirstPassAttempts ?? recogFirstPassCount,
    recentFirstPass: recogRecentFirstPass,
    retryCorrect: lifetime?.recogRetryCorrect ?? recogRetryCorrect,
    retryIncorrect: lifetime?.recogRetryIncorrect ?? recogRetryIncorrect,
    latestFirstPassCorrect: recogLatestFirstPassCorrect,
  });

  const recognitionAxis: PracticeAxisSummary = {
    axis: "recognition",
    state: recogClassification.state,
    lifetimeFirstPassAttempts: lifetime?.recogFirstPassAttempts ?? recogFirstPassCount,
    lifetimeFirstPassCorrect: lifetime?.recogFirstPassCorrect ?? recogFirstPassCorrect,
    lifetimeFirstPassIncorrect: lifetime?.recogFirstPassIncorrect ?? recogFirstPassIncorrect,
    lifetimeRetryAttempts: lifetime?.recogRetryAttempts ?? recogRetryCount,
    lifetimeRetryCorrect: lifetime?.recogRetryCorrect ?? recogRetryCorrect,
    lifetimeRetryIncorrect: lifetime?.recogRetryIncorrect ?? recogRetryIncorrect,
    recentFirstPassAttempts: recogRecentFirstPass,
    recentAttemptsCount: recogRecentFirstPass.length,
    recentCorrectCount: recogRecentFirstPass.filter((a) => a.correct).length,
    recentIncorrectCount: recogRecentFirstPass.filter((a) => !a.correct).length,
    latestFirstPassCorrect: recogLatestFirstPassCorrect,
    lastFirstPassAt: recogLastFirstPassAt,
    latestFirstPassMatchingRetryCorrect: recogMatchingRetryCorrect,
    explanationVi: recogClassification.explanationVi,
  };

  // Classify Production Axis
  const prodClassification = classifyPracticeWindow({
    firstPassAttempts: lifetime?.prodFirstPassAttempts ?? prodFirstPassCount,
    recentFirstPass: prodRecentFirstPass,
    retryCorrect: lifetime?.prodRetryCorrect ?? prodRetryCorrect,
    retryIncorrect: lifetime?.prodRetryIncorrect ?? prodRetryIncorrect,
    latestFirstPassCorrect: prodLatestFirstPassCorrect,
  });

  const productionAxis: PracticeAxisSummary = {
    axis: "production",
    state: prodClassification.state,
    lifetimeFirstPassAttempts: lifetime?.prodFirstPassAttempts ?? prodFirstPassCount,
    lifetimeFirstPassCorrect: lifetime?.prodFirstPassCorrect ?? prodFirstPassCorrect,
    lifetimeFirstPassIncorrect: lifetime?.prodFirstPassIncorrect ?? prodFirstPassIncorrect,
    lifetimeRetryAttempts: lifetime?.prodRetryAttempts ?? prodRetryCount,
    lifetimeRetryCorrect: lifetime?.prodRetryCorrect ?? prodRetryCorrect,
    lifetimeRetryIncorrect: lifetime?.prodRetryIncorrect ?? prodRetryIncorrect,
    recentFirstPassAttempts: prodRecentFirstPass,
    recentAttemptsCount: prodRecentFirstPass.length,
    recentCorrectCount: prodRecentFirstPass.filter((a) => a.correct).length,
    recentIncorrectCount: prodRecentFirstPass.filter((a) => !a.correct).length,
    latestFirstPassCorrect: prodLatestFirstPassCorrect,
    lastFirstPassAt: prodLastFirstPassAt,
    latestFirstPassMatchingRetryCorrect: prodMatchingRetryCorrect,
    explanationVi: prodClassification.explanationVi,
  };

  // Determine Legacy overall classification
  const effectiveFirstPassAttempts = lifetime?.firstPassAttempts ?? firstPassAttempts;
  const effectiveRetryCorrect = lifetime?.retryCorrect ?? retryCorrect;
  const effectiveRetryIncorrect = lifetime?.retryIncorrect ?? retryIncorrect;

  const { category, explanationVi } = computeCardClassification(
    effectiveFirstPassAttempts,
    recentFirstPassAttempts,
    effectiveRetryCorrect,
    effectiveRetryIncorrect,
    latestFirstPassCorrect
  );

  return {
    flashcardId,
    firstPassAttempts: effectiveFirstPassAttempts,
    firstPassCorrect: lifetime?.firstPassCorrect ?? firstPassCorrect,
    firstPassIncorrect: lifetime?.firstPassIncorrect ?? firstPassIncorrect,
    retryAttempts: lifetime?.retryAttempts ?? retryAttempts,
    retryCorrect: effectiveRetryCorrect,
    retryIncorrect: effectiveRetryIncorrect,
    latestFirstPassCorrect,
    lastPracticedAt,
    lastFirstPassAt,
    latestFirstPassMatchingRetryCorrect: overallMatchingRetryCorrect,
    breakdownByQuestionType: lifetime?.breakdownByQuestionType ?? breakdown,
    recentFirstPassAttempts,
    recentModalityEvidence,
    classification: category,
    explanationVi,
    recognitionAxis,
    productionAxis,
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
   * Fetches and aggregates practice evidence for all cards in one or more decks
   * through fixed, batched queries. A string preserves the existing single-deck API.
   */
  async getDeckPracticeEvidence(deckId: string | string[]): Promise<{
    summaries: Map<string, PracticeEvidenceSummary>;
    needPracticeCards: NeedPracticeCardItem[];
    counts: Record<PracticeSignalCategory, number>;
  }> {
    const deckIds = Array.from(new Set(Array.isArray(deckId) ? deckId : [deckId]));
    const emptyCounts: Record<PracticeSignalCategory, number> = {
      NO_EVIDENCE: 0,
      INSUFFICIENT_DATA: 0,
      NEEDS_PRACTICE: 0,
      MIXED: 0,
      RECENTLY_SUCCESSFUL: 0,
    };

    if (deckIds.length === 0) {
      return { summaries: new Map(), needPracticeCards: [], counts: emptyCounts };
    }

    // 1. Fetch cards for the requested deck scope.
    const cards = await db.flashcard.findMany({
      where: { deckId: { in: deckIds } },
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
        counts: emptyCounts,
      };
    }

    const cardIds = cards.map((c) => c.id);

    // 2. Fetch recent practice attempts (bounded to at most 5 first-pass attempts + their retries per card)
    // using SQLite window function with deterministic tie-breaker: createdAt DESC, attemptNumber DESC, id DESC.
    const rawAttempts = await db.$queryRaw<
      Array<{
        id: string;
        flashcardId: string;
        sessionId: string;
        questionId: string | null;
        prompt: string | null;
        attemptNumber: number;
        mode: string;
        questionType: string;
        correct: boolean | number;
        answer: string;
        expectedAnswer: string;
        responseMs: number | null;
        createdAt: Date | string;
      }>
    >`
      WITH AxisAttempts AS (
        SELECT 
          pa.id,
          pa.flashcardId,
          pa.sessionId,
          pa.questionId,
          pa.prompt,
          pa.attemptNumber,
          pa.mode,
          pa.questionType,
          pa.correct,
          pa.answer,
          pa.expectedAnswer,
          pa.responseMs,
          pa.createdAt,
          CASE 
            WHEN pa.questionType IN ('typed_vi_en', 'story_cloze') THEN 'production'
            WHEN pa.questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') THEN 'recognition'
            ELSE NULL
          END AS evidenceAxis,
          ROW_NUMBER() OVER (
            PARTITION BY pa.flashcardId, 
              CASE 
                WHEN pa.questionType IN ('typed_vi_en', 'story_cloze') THEN 'production'
                WHEN pa.questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') THEN 'recognition'
                ELSE NULL
              END
            ORDER BY pa.createdAt DESC, pa.attemptNumber DESC, pa.id DESC
          ) as rn
        FROM practice_attempts pa
        WHERE pa.flashcardId IN (${Prisma.join(cardIds)})
          AND pa.attemptNumber = 1
          AND pa.questionType != 'story_comprehension'
      ),
      SelectedFirstPass AS (
        SELECT * FROM AxisAttempts WHERE rn <= 5 AND evidenceAxis IS NOT NULL
      )
      SELECT 
        id, flashcardId, sessionId, questionId, prompt, attemptNumber,
        mode, questionType, correct, answer, expectedAnswer, responseMs, createdAt
      FROM SelectedFirstPass
      UNION ALL
      SELECT 
        rpa.id, rpa.flashcardId, rpa.sessionId, rpa.questionId, rpa.prompt, rpa.attemptNumber,
        rpa.mode, rpa.questionType, rpa.correct, rpa.answer, rpa.expectedAnswer, rpa.responseMs, rpa.createdAt
      FROM practice_attempts rpa
      JOIN SelectedFirstPass sfp 
        ON rpa.flashcardId = sfp.flashcardId 
       AND rpa.sessionId = sfp.sessionId 
       AND ((rpa.questionId IS NOT NULL AND rpa.questionId = sfp.questionId) OR (rpa.questionId IS NULL AND sfp.questionId IS NULL))
      WHERE rpa.flashcardId IN (${Prisma.join(cardIds)})
        AND rpa.attemptNumber = 2
      ORDER BY createdAt ASC, attemptNumber ASC, id ASC;
    `;

    // 3. Lifetime summary aggregation per card in a single GROUP BY query (0 N+1)
    const rawLifetime = await db.$queryRaw<
      Array<{
        flashcardId: string;
        firstPassAttempts: bigint | number;
        firstPassCorrect: bigint | number;
        firstPassIncorrect: bigint | number;
        retryAttempts: bigint | number;
        retryCorrect: bigint | number;
        retryIncorrect: bigint | number;
        typedAttempts: bigint | number;
        typedCorrect: bigint | number;
        typedIncorrect: bigint | number;
        storyClozeAttempts: bigint | number;
        storyClozeCorrect: bigint | number;
        storyClozeIncorrect: bigint | number;
        mcAttempts: bigint | number;
        mcCorrect: bigint | number;
        mcIncorrect: bigint | number;
        prodFirstPassAttempts: bigint | number;
        prodFirstPassCorrect: bigint | number;
        prodFirstPassIncorrect: bigint | number;
        prodRetryAttempts: bigint | number;
        prodRetryCorrect: bigint | number;
        prodRetryIncorrect: bigint | number;
        recogFirstPassAttempts: bigint | number;
        recogFirstPassCorrect: bigint | number;
        recogFirstPassIncorrect: bigint | number;
        recogRetryAttempts: bigint | number;
        recogRetryCorrect: bigint | number;
        recogRetryIncorrect: bigint | number;
      }>
    >`
      SELECT 
        flashcardId,
        COUNT(CASE WHEN attemptNumber = 1 THEN 1 END) as firstPassAttempts,
        COUNT(CASE WHEN attemptNumber = 1 AND correct THEN 1 END) as firstPassCorrect,
        COUNT(CASE WHEN attemptNumber = 1 AND NOT correct THEN 1 END) as firstPassIncorrect,
        COUNT(CASE WHEN attemptNumber = 2 THEN 1 END) as retryAttempts,
        COUNT(CASE WHEN attemptNumber = 2 AND correct THEN 1 END) as retryCorrect,
        COUNT(CASE WHEN attemptNumber = 2 AND NOT correct THEN 1 END) as retryIncorrect,
        COUNT(CASE WHEN questionType = 'typed_vi_en' THEN 1 END) as typedAttempts,
        COUNT(CASE WHEN questionType = 'typed_vi_en' AND correct THEN 1 END) as typedCorrect,
        COUNT(CASE WHEN questionType = 'typed_vi_en' AND NOT correct THEN 1 END) as typedIncorrect,
        COUNT(CASE WHEN questionType = 'story_cloze' THEN 1 END) as storyClozeAttempts,
        COUNT(CASE WHEN questionType = 'story_cloze' AND correct THEN 1 END) as storyClozeCorrect,
        COUNT(CASE WHEN questionType = 'story_cloze' AND NOT correct THEN 1 END) as storyClozeIncorrect,
        COUNT(CASE WHEN questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') THEN 1 END) as mcAttempts,
        COUNT(CASE WHEN questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') AND correct THEN 1 END) as mcCorrect,
        COUNT(CASE WHEN questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') AND NOT correct THEN 1 END) as mcIncorrect,
        -- Production axis lifetime totals
        COUNT(CASE WHEN questionType IN ('typed_vi_en', 'story_cloze') AND attemptNumber = 1 THEN 1 END) as prodFirstPassAttempts,
        COUNT(CASE WHEN questionType IN ('typed_vi_en', 'story_cloze') AND attemptNumber = 1 AND correct THEN 1 END) as prodFirstPassCorrect,
        COUNT(CASE WHEN questionType IN ('typed_vi_en', 'story_cloze') AND attemptNumber = 1 AND NOT correct THEN 1 END) as prodFirstPassIncorrect,
        COUNT(CASE WHEN questionType IN ('typed_vi_en', 'story_cloze') AND attemptNumber = 2 THEN 1 END) as prodRetryAttempts,
        COUNT(CASE WHEN questionType IN ('typed_vi_en', 'story_cloze') AND attemptNumber = 2 AND correct THEN 1 END) as prodRetryCorrect,
        COUNT(CASE WHEN questionType IN ('typed_vi_en', 'story_cloze') AND attemptNumber = 2 AND NOT correct THEN 1 END) as prodRetryIncorrect,
        -- Recognition axis lifetime totals
        COUNT(CASE WHEN questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') AND attemptNumber = 1 THEN 1 END) as recogFirstPassAttempts,
        COUNT(CASE WHEN questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') AND attemptNumber = 1 AND correct THEN 1 END) as recogFirstPassCorrect,
        COUNT(CASE WHEN questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') AND attemptNumber = 1 AND NOT correct THEN 1 END) as recogFirstPassIncorrect,
        COUNT(CASE WHEN questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') AND attemptNumber = 2 THEN 1 END) as recogRetryAttempts,
        COUNT(CASE WHEN questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') AND attemptNumber = 2 AND correct THEN 1 END) as recogRetryCorrect,
        COUNT(CASE WHEN questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') AND attemptNumber = 2 AND NOT correct THEN 1 END) as recogRetryIncorrect
      FROM practice_attempts
      WHERE flashcardId IN (${Prisma.join(cardIds)})
      GROUP BY flashcardId;
    `;

    const lifetimeByCardId = new Map(rawLifetime.map((row) => [row.flashcardId, row]));

    // 4. Group recent window attempts by flashcardId
    const attemptsByCardId = new Map<string, PracticeAttempt[]>();
    for (const a of rawAttempts) {
      const attempt: PracticeAttempt = {
        id: a.id,
        flashcardId: a.flashcardId,
        sessionId: a.sessionId,
        questionId: a.questionId,
        prompt: a.prompt,
        attemptNumber: Number(a.attemptNumber),
        mode: a.mode,
        questionType: a.questionType,
        correct: Boolean(a.correct),
        answer: a.answer,
        expectedAnswer: a.expectedAnswer,
        responseMs: a.responseMs != null ? Number(a.responseMs) : null,
        createdAt: a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt),
      };
      const list = attemptsByCardId.get(a.flashcardId) ?? [];
      list.push(attempt);
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

    // 5. Compute summaries
    for (const card of cards) {
      const cardAttempts = attemptsByCardId.get(card.id) ?? [];
      const lifetime = lifetimeByCardId.get(card.id);
      let lifetimeOverrides: CardPracticeLifetimeOverrides | undefined;
      if (lifetime) {
        lifetimeOverrides = {
          firstPassAttempts: Number(lifetime.firstPassAttempts),
          firstPassCorrect: Number(lifetime.firstPassCorrect),
          firstPassIncorrect: Number(lifetime.firstPassIncorrect),
          retryAttempts: Number(lifetime.retryAttempts),
          retryCorrect: Number(lifetime.retryCorrect),
          retryIncorrect: Number(lifetime.retryIncorrect),
          recogFirstPassAttempts: Number(lifetime.recogFirstPassAttempts),
          recogFirstPassCorrect: Number(lifetime.recogFirstPassCorrect),
          recogFirstPassIncorrect: Number(lifetime.recogFirstPassIncorrect),
          recogRetryAttempts: Number(lifetime.recogRetryAttempts),
          recogRetryCorrect: Number(lifetime.recogRetryCorrect),
          recogRetryIncorrect: Number(lifetime.recogRetryIncorrect),
          prodFirstPassAttempts: Number(lifetime.prodFirstPassAttempts),
          prodFirstPassCorrect: Number(lifetime.prodFirstPassCorrect),
          prodFirstPassIncorrect: Number(lifetime.prodFirstPassIncorrect),
          prodRetryAttempts: Number(lifetime.prodRetryAttempts),
          prodRetryCorrect: Number(lifetime.prodRetryCorrect),
          prodRetryIncorrect: Number(lifetime.prodRetryIncorrect),
          breakdownByQuestionType: {
            typedRecall: {
              attempts: Number(lifetime.typedAttempts),
              correct: Number(lifetime.typedCorrect),
              incorrect: Number(lifetime.typedIncorrect),
            },
            storyCloze: {
              attempts: Number(lifetime.storyClozeAttempts),
              correct: Number(lifetime.storyClozeCorrect),
              incorrect: Number(lifetime.storyClozeIncorrect),
            },
            multipleChoice: {
              attempts: Number(lifetime.mcAttempts),
              correct: Number(lifetime.mcCorrect),
              incorrect: Number(lifetime.mcIncorrect),
            },
            other: { attempts: 0, correct: 0, incorrect: 0 },
          },
        };
      }
      const summary = aggregateCardPracticeEvidence(card.id, cardAttempts, lifetimeOverrides);
      summaries.set(card.id, summary);
      counts[summary.classification] += 1;

      // Candidates for "Cần luyện thêm" are STRICTLY multi-axis confirmed weakness:
      // Either axis in NEEDS_PRACTICE or MIXED.
      // INSUFFICIENT_DATA and NO_EVIDENCE are strictly excluded.
      // Legacy summary.classification is NEVER used to determine weakness.
      const isWeakCard = isWeakCardSummary(summary);

      if (isWeakCard) {
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
   * Returns confirmed weak-card counts for several decks with one compact
   * projection. It intentionally reuses the canonical axis classifier instead
   * of re-implementing weakness rules in SQL.
   *
   * Unlike getDeckPracticeEvidence(), this Home-facing helper does not hydrate
   * cards, lexical fields, or raw PracticeAttempt history. SQL returns only
   * per-card/per-axis lifetime totals and a five-attempt outcome window.
   */
  async getDeckWeakCardCounts(deckIdsInput: string[]): Promise<Map<string, number>> {
    const deckIds = Array.from(new Set(deckIdsInput));
    const weakCountByDeckId = new Map(deckIds.map((deckId) => [deckId, 0]));
    if (deckIds.length === 0) return weakCountByDeckId;

    const rows = await db.$queryRaw<
      Array<{
        flashcardId: string;
        deckId: string;
        axis: PracticeEvidenceAxis;
        firstPassAttempts: bigint | number;
        retryCorrect: bigint | number;
        retryIncorrect: bigint | number;
        recentFirstPassAttempts: bigint | number;
        recentFirstPassCorrect: bigint | number;
        latestFirstPassCorrect: bigint | number | null;
      }>
    >`
      WITH FilteredAttempts AS (
        SELECT
          pa.flashcardId,
          f.deckId,
          CASE
            WHEN pa.questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab') THEN 'recognition'
            WHEN pa.questionType IN ('typed_vi_en', 'story_cloze') THEN 'production'
          END AS axis,
          pa.attemptNumber,
          CASE WHEN pa.correct THEN 1 ELSE 0 END AS isCorrect,
          pa.createdAt,
          pa.id
        FROM practice_attempts pa
        INNER JOIN flashcards f ON f.id = pa.flashcardId
        WHERE f.deckId IN (${Prisma.join(deckIds)})
          AND pa.questionType IN ('multiple_choice', 'multiple_choice_en_vi', 'multiple_choice_vi_en', 'fill_in_blank', 'story_contextual_vocab', 'typed_vi_en', 'story_cloze')
      ),
      FirstPassRanked AS (
        SELECT
          flashcardId,
          deckId,
          axis,
          isCorrect,
          ROW_NUMBER() OVER (
            PARTITION BY flashcardId, axis
            ORDER BY createdAt DESC, id DESC
          ) AS rowNumber
        FROM FilteredAttempts
        WHERE attemptNumber = 1
      ),
      Lifetime AS (
        SELECT
          flashcardId,
          deckId,
          axis,
          COUNT(CASE WHEN attemptNumber = 1 THEN 1 END) AS firstPassAttempts,
          COUNT(CASE WHEN attemptNumber = 2 AND isCorrect = 1 THEN 1 END) AS retryCorrect,
          COUNT(CASE WHEN attemptNumber = 2 AND isCorrect = 0 THEN 1 END) AS retryIncorrect
        FROM FilteredAttempts
        GROUP BY flashcardId, deckId, axis
      ),
      RecentWindow AS (
        SELECT
          flashcardId,
          deckId,
          axis,
          COUNT(*) AS recentFirstPassAttempts,
          COUNT(CASE WHEN isCorrect = 1 THEN 1 END) AS recentFirstPassCorrect,
          MAX(CASE WHEN rowNumber = 1 THEN isCorrect END) AS latestFirstPassCorrect
        FROM FirstPassRanked
        WHERE rowNumber <= ${EVIDENCE_CONFIG.RECENT_WINDOW_SIZE}
        GROUP BY flashcardId, deckId, axis
      )
      SELECT
        lifetime.flashcardId,
        lifetime.deckId,
        lifetime.axis,
        lifetime.firstPassAttempts,
        lifetime.retryCorrect,
        lifetime.retryIncorrect,
        COALESCE(recent.recentFirstPassAttempts, 0) AS recentFirstPassAttempts,
        COALESCE(recent.recentFirstPassCorrect, 0) AS recentFirstPassCorrect,
        recent.latestFirstPassCorrect
      FROM Lifetime lifetime
      LEFT JOIN RecentWindow recent
        ON recent.flashcardId = lifetime.flashcardId
       AND recent.axis = lifetime.axis;
    `;

    const axisStatesByCardId = new Map<
      string,
      { deckId: string; recognition: AxisEvidenceState; production: AxisEvidenceState }
    >();

    for (const row of rows) {
      const recentAttemptCount = Math.max(0, Number(row.recentFirstPassAttempts));
      const recentCorrectCount = Math.min(
        recentAttemptCount,
        Math.max(0, Number(row.recentFirstPassCorrect))
      );
      // classifyPracticeWindow only reads count and correctness from this window.
      // Constructing this compact shape preserves its single source of truth
      // without materializing persisted PracticeAttempt records.
      const recentFirstPass = Array.from({ length: recentAttemptCount }, (_, index) => ({
        attemptNumber: 1,
        correct: index < recentCorrectCount,
        questionType: row.axis,
        responseMs: null,
        createdAt: new Date(0),
      }));
      const latestFirstPassCorrect =
        row.latestFirstPassCorrect === null ? null : Number(row.latestFirstPassCorrect) === 1;
      const state = classifyPracticeWindow({
        firstPassAttempts: Number(row.firstPassAttempts),
        recentFirstPass,
        retryCorrect: Number(row.retryCorrect),
        retryIncorrect: Number(row.retryIncorrect),
        latestFirstPassCorrect,
      }).state;
      const current = axisStatesByCardId.get(row.flashcardId) ?? {
        deckId: row.deckId,
        recognition: "NO_EVIDENCE" as AxisEvidenceState,
        production: "NO_EVIDENCE" as AxisEvidenceState,
      };
      current[row.axis] = state;
      axisStatesByCardId.set(row.flashcardId, current);
    }

    for (const { deckId, recognition, production } of axisStatesByCardId.values()) {
      if (
        isWeakCardSummary({
          recognitionAxis: { state: recognition },
          productionAxis: { state: production },
        })
      ) {
        weakCountByDeckId.set(deckId, (weakCountByDeckId.get(deckId) ?? 0) + 1);
      }
    }

    return weakCountByDeckId;
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
   * Selects targeted candidate cards for Focused Practice (Phase 1A).
   * Used when explicit cardIds are requested (e.g. from Mistake Bank).
   * - Authoritative target set: cardIds are validated to belong to deckId and deduplicated.
   * - Does NOT filter out INSUFFICIENT_DATA or RECENTLY_SUCCESSFUL: user's selection is authoritative!
   * - Modality is still adaptively selected via selectPracticeMode(card, summary).
   * - Bounded to limit (max 30).
   */
  async getTargetedPracticeCandidates(
    deckId: string,
    targetCardIds: string[],
    limit: number = FOCUSED_PRACTICE_SESSION_LIMIT
  ): Promise<FocusedPracticeCandidate[]> {
    if (!targetCardIds || targetCardIds.length === 0) {
      return [];
    }

    // 1. Deduplicate & bound cardIds
    const uniqueCardIds = Array.from(new Set(targetCardIds)).slice(0, Math.min(Math.max(1, limit), 30));

    // 2. Fetch evidence summaries for this deck
    const { summaries } = await this.getDeckPracticeEvidence(deckId);

    // 3. Fetch cards belonging STRICTLY to this deck (anti cross-deck leakage)
    const cards = await db.flashcard.findMany({
      where: {
        id: { in: uniqueCardIds },
        deckId,
      },
    });

    if (cards.length === 0) {
      return [];
    }

    // Maintain the order of targetCardIds
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const orderedCards = uniqueCardIds
      .map((id) => cardMap.get(id))
      .filter((c): c is typeof cards[0] => c !== undefined);

    // 4. Resolve story context
    const stories = await db.story.findMany({
      where: { deckId },
      orderBy: { createdAt: "desc" },
    });

    const cardsWithStoryContext = new Set<string>();
    const cardByTerm = new Map<string, string>();
    for (const card of orderedCards) {
      cardByTerm.set(card.term.trim().toLowerCase(), card.id);
      if (card.normalizedTerm) {
        cardByTerm.set(card.normalizedTerm.trim().toLowerCase(), card.id);
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

    // 5. Build candidates for each target card (WITHOUT filtering out INSUFFICIENT_DATA or RECENTLY_SUCCESSFUL)
    return orderedCards.map((card) => {
      const summary = summaries.get(card.id) ?? aggregateCardPracticeEvidence(card.id, []);
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
      const hasStory = cardsWithStoryContext.has(card.id);
      const modeSelection = selectPracticeMode(card, summary, { hasStoryContext: hasStory });
      return {
        card,
        summary,
        priorityScore,
        signals,
        signalReasonVi: signalReasonVi || "Từ được chọn để luyện tập lại",
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

    const resolvedProdCardIds: string[] = [];
    const resolvedRecogCardIds: string[] = [];
    for (const [cardId, summary] of summaries.entries()) {
      if (summary.productionAxis.state === "STRONG") {
        resolvedProdCardIds.push(cardId);
      }
      if (summary.recognitionAxis.state === "STRONG") {
        resolvedRecogCardIds.push(cardId);
      }
    }

    if (filter === "TYPED") {
      baseWhere.questionType = "typed_vi_en";
    } else if (filter === "FILL_IN_BLANK") {
      baseWhere.questionType = "fill_in_blank";
    } else if (filter === "MULTIPLE_CHOICE") {
      baseWhere.questionType = { in: ["multiple_choice_en_vi", "multiple_choice_vi_en", "multiple_choice"] };
    } else if (filter === "STORY_CLOZE") {
      baseWhere.questionType = "story_cloze";
    } else if (filter === "STORY_CONTEXTUAL_VOCAB") {
      baseWhere.questionType = "story_contextual_vocab";
    } else if (filter === "RECENT_MISTAKES") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      baseWhere.createdAt = { gte: sevenDaysAgo };
    } else if (filter === "RESOLVED") {
      // Strict Same-Axis: Resolved only if the corresponding axis is STRONG
      baseWhere.OR = [
        {
          flashcardId: { in: resolvedProdCardIds },
          questionType: { in: ["typed_vi_en", "story_cloze"] },
        },
        {
          flashcardId: { in: resolvedRecogCardIds },
          questionType: {
            in: [
              "multiple_choice",
              "multiple_choice_en_vi",
              "multiple_choice_vi_en",
              "fill_in_blank",
              "story_contextual_vocab",
            ],
          },
        },
      ];
    } else if (filter === "NEEDS_PRACTICE") {
      // Strict Same-Axis: Mistake is not resolved
      baseWhere.NOT = [
        {
          flashcardId: { in: resolvedProdCardIds },
          questionType: { in: ["typed_vi_en", "story_cloze"] },
        },
        {
          flashcardId: { in: resolvedRecogCardIds },
          questionType: {
            in: [
              "multiple_choice",
              "multiple_choice_en_vi",
              "multiple_choice_vi_en",
              "fill_in_blank",
              "story_contextual_vocab",
            ],
          },
        },
      ];
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

    const resolvedCount = await db.practiceAttempt.count({
      where: {
        flashcard: { deckId },
        correct: false,
        attemptNumber: 1,
        OR: [
          {
            flashcardId: { in: resolvedProdCardIds },
            questionType: { in: ["typed_vi_en", "story_cloze"] },
          },
          {
            flashcardId: { in: resolvedRecogCardIds },
            questionType: {
              in: [
                "multiple_choice",
                "multiple_choice_en_vi",
                "multiple_choice_vi_en",
                "fill_in_blank",
                "story_contextual_vocab",
              ],
            },
          },
        ],
      },
    });

    const needsPracticeCount = Math.max(0, allAttemptsCount - resolvedCount);

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
        const mistakeAxis = getPracticeEvidenceAxis(att.questionType);
        const axisSummary =
          mistakeAxis === "production"
            ? summary.productionAxis
            : summary.recognitionAxis;

        if (axisSummary.state === "STRONG") {
          derivedStatus = "RESOLVED";
        } else if (axisSummary.state === "MIXED") {
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

function getLatestIncorrectFirstPassAt(axis: PracticeAxisSummary): Date | null {
  for (let i = axis.recentFirstPassAttempts.length - 1; i >= 0; i--) {
    const att = axis.recentFirstPassAttempts[i];
    if (!att.correct) {
      return att.createdAt;
    }
  }
  return null;
}

/**
 * Pure deterministic helper: selects targeted practice mode based on transparent multi-axis evidence.
 * Concept:
 * 1. ONLY Recognition weak -> recognition remediation (fill_in_blank if example exists, else multiple_choice_vi_en)
 * 2. ONLY Production weak -> typed_vi_en (Active Recall)
 * 3. BOTH weak -> remediate the axis whose most recent first-pass failure is more current.
 *    Tie-breaker: Production (typed_vi_en)
 * 4. General fallback -> typed_vi_en
 */
export function selectPracticeMode(
  card: { term: string; meaningVi: string; exampleEn?: string | null },
  summary: PracticeEvidenceSummary,
  _capabilities: { hasStoryContext: boolean }
): PracticeModeSelection {
  void _capabilities;

  const recogWeak =
    summary.recognitionAxis.state === "NEEDS_PRACTICE" ||
    summary.recognitionAxis.state === "MIXED";
  const prodWeak =
    summary.productionAxis.state === "NEEDS_PRACTICE" ||
    summary.productionAxis.state === "MIXED";

  let chosenAxis: PracticeEvidenceAxis;

  if (recogWeak && !prodWeak) {
    chosenAxis = "recognition";
  } else if (prodWeak && !recogWeak) {
    chosenAxis = "production";
  } else if (recogWeak && prodWeak) {
    const recogFailTime =
      getLatestIncorrectFirstPassAt(summary.recognitionAxis)?.getTime() ?? 0;
    const prodFailTime =
      getLatestIncorrectFirstPassAt(summary.productionAxis)?.getTime() ?? 0;
    if (recogFailTime > prodFailTime) {
      chosenAxis = "recognition";
    } else if (prodFailTime > recogFailTime) {
      chosenAxis = "production";
    } else {
      // Tie: Production tie-breaker
      chosenAxis = "production";
    }
  } else {
    // Targeted practice on non-weak or insufficient card
    const recogFailTime =
      getLatestIncorrectFirstPassAt(summary.recognitionAxis)?.getTime() ?? 0;
    const prodFailTime =
      getLatestIncorrectFirstPassAt(summary.productionAxis)?.getTime() ?? 0;
    if (recogFailTime > prodFailTime && recogFailTime > 0) {
      chosenAxis = "recognition";
    } else {
      chosenAxis = "production";
    }
  }

  if (chosenAxis === "recognition") {
    const { recentIncorrectCount, recentAttemptsCount } = summary.recognitionAxis;
    if (card.exampleEn && card.exampleEn.length > 5) {
      return {
        targetQuestionType: "fill_in_blank",
        selectionReason: `Nhận diện: ${recentIncorrectCount}/${recentAttemptsCount} lần chưa đúng gần đây (luyện điền từ vào câu)`,
      };
    }
    return {
      targetQuestionType: "multiple_choice_vi_en",
      selectionReason: `Nhận diện: ${recentIncorrectCount}/${recentAttemptsCount} lần chưa đúng gần đây`,
    };
  }

  // Production axis
  const { recentIncorrectCount, recentAttemptsCount } = summary.productionAxis;
  const lastProdFail = summary.productionAxis.recentFirstPassAttempts
    .slice()
    .reverse()
    .find((a) => !a.correct);
  const isStoryClozeFailure = lastProdFail?.questionType === "story_cloze";

  let reason: string;
  if (isStoryClozeFailure) {
    reason = `Từng sai khi điền từ trong truyện (${recentIncorrectCount}/${recentAttemptsCount}); củng cố bằng Gõ từ`;
  } else if (recentAttemptsCount > 0) {
    reason = `Gõ từ: ${recentIncorrectCount}/${recentAttemptsCount} lần chưa đúng gần đây`;
  } else if (summary.productionAxis.state === "NEEDS_PRACTICE") {
    reason = "Lần làm bài gần nhất chưa đúng, luyện lại dạng Gõ từ";
  } else {
    reason = "Củng cố bằng dạng Gõ từ (Active Recall)";
  }

  return {
    targetQuestionType: "typed_vi_en",
    selectionReason: reason,
  };
}

export const practiceEvidenceService = new PracticeEvidenceService();
