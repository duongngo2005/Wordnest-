import { db } from "@/lib/db";
import { PracticeAttempt } from "@prisma/client";
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
  };
  summary: PracticeEvidenceSummary;
  priorityScore: number;
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
 * Pure function: Deterministic priority key for sorting "Cần luyện thêm" (highest priority first).
 * Prioritizes transparent signals:
 * Tier 400: latest first-pass incorrect + retry also incorrect
 * Tier 300: latest first-pass incorrect
 * Tier 200: NEEDS_PRACTICE (high failure rate in recent window)
 * Tier 100: MIXED (inconsistent recent performance)
 * Tier 0:   NO_EVIDENCE or INSUFFICIENT_DATA or RECENTLY_SUCCESSFUL
 */
export function getNeedPracticePriority(summary: PracticeEvidenceSummary): number {
  if (summary.classification === "NO_EVIDENCE" || summary.classification === "INSUFFICIENT_DATA") {
    return 0;
  }

  const latestFirstPassWrong = summary.latestFirstPassCorrect === false;
  const retryAlsoWrong = summary.retryIncorrect > 0 && summary.retryAttempts > summary.retryCorrect;

  if (latestFirstPassWrong && retryAlsoWrong) {
    return 400; // Tier 1: Sai lần đầu + sai cả khi luyện lại
  }
  if (latestFirstPassWrong) {
    return 300; // Tier 2: Sai lần đầu gần nhất
  }
  if (summary.classification === "NEEDS_PRACTICE") {
    return 200; // Tier 3: Tỷ lệ sai cao trong chu kỳ gần đây
  }
  if (summary.classification === "MIXED") {
    return 100; // Tier 4: Kết quả chưa ổn định
  }
  return 10; // Tier 5: Đang thực hành tốt
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
      a.questionType === "fill_in_blank"
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
        const priorityScore = getNeedPracticePriority(summary);
        needPracticeCards.push({
          card,
          summary,
          priorityScore,
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

    return topCandidates.map(({ card, summary, priorityScore }) => {
      const hasStory = cardsWithStoryContext.has(card.id);
      const modeSelection = selectPracticeMode(card, summary, { hasStoryContext: hasStory });
      return {
        card,
        summary,
        priorityScore,
        targetQuestionType: modeSelection.targetQuestionType,
        selectionReason: modeSelection.selectionReason,
      };
    });
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
