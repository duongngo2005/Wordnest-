import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildProductionCues,
  normalizeProductionCue,
  type ProductionCue,
} from "@/lib/quiz/production-cue";
import { createRandomLetterHint } from "@/lib/quiz/random-letter-hint";
import {
  quizService,
  QuizSubmissionError,
  sanitizeProductionChallengeQuestionForClient,
  type QuizQuestion,
  type QuizSubmissionPayload,
  type QuizSubmissionResult,
  type ServerTypedViEnQuizQuestion,
} from "./quiz-service";
import {
  practiceEvidenceService,
  type PracticeAxisSummary,
} from "./practice-evidence-service";
import { fsrsService } from "@/services/fsrs";

export const GLOBAL_TYPING_MODE = "global_typing";
export const GLOBAL_TYPING_ASSISTED_MODE = "global_typing_hint";
export const DUE_TYPING_MODE = "due_typing";
export const GLOBAL_TYPING_COUNTS = [10, 20, 50] as const;
export type GlobalTypingQuestionCount = (typeof GLOBAL_TYPING_COUNTS)[number];
export type GlobalTypingQueueMode = "all" | "weak" | "retry";

const SESSION_DURATION_MS = 30 * 60 * 1000;
const WEAKNESS_RECENCY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const WEAKNESS_DECAY_DAYS = 28;

type RandomSource = () => number;

export interface GlobalTypingCard {
  id: string;
  term: string;
  normalizedTerm: string;
  meaningVi: string;
  definitionEn: string | null;
  ipa: string | null;
  partOfSpeech: string | null;
  cefr: string | null;
  exampleEn: string | null;
  exampleVi: string | null;
  createdAt: Date;
}

export interface GlobalTypingCandidateEvidence {
  typed: PracticeAxisSummary | undefined;
  repeatedTypingErrorCount: number;
}

export interface GlobalTypingSession {
  sessionId: string;
  questions: QuizQuestion[];
  totalEligible: number;
  emptyReason: "no_vocabulary" | "no_safe_cues" | "no_weak_cards" | "no_retry_cards" | null;
}

export interface DueTypingSession {
  sessionId: string;
  questions: QuizQuestion[];
  totalEligible: number;
  emptyReason: "no_due_cards" | "no_safe_cues" | null;
}

type TypingQuestionConfig = {
  idPrefix: string;
  mode: string;
};

function isStoredDueTypingQuestion(question: unknown): boolean {
  return (
    typeof question === "object" &&
    question !== null &&
    "type" in question &&
    question.type === "typed_vi_en" &&
    "mode" in question &&
    question.mode === DUE_TYPING_MODE
  );
}

function daysSince(date: Date | null, now: Date): number {
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function isRecentWeakEvidence(
  evidence: PracticeAxisSummary | undefined,
  now: Date
): boolean {
  if (!evidence || !evidence.lastFirstPassAt) return false;
  if (daysSince(evidence.lastFirstPassAt, now) > WEAKNESS_RECENCY_WINDOW_MS / 86_400_000) {
    return false;
  }
  return (
    evidence.latestFirstPassCorrect === false ||
    evidence.state === "NEEDS_PRACTICE" ||
    evidence.state === "MIXED"
  );
}

/**
 * A capped, decaying priority preserves randomness and lets old mistakes fade.
 * A stable recent correct answer receives the neutral baseline, never a
 * permanent penalty from an old failure. Repeated misspellings provide a
 * small, bounded boost only.
 */
export function globalTypingWeight(
  evidence: GlobalTypingCandidateEvidence | undefined,
  now: Date
): number {
  const typed = evidence?.typed;
  if (!typed) return 1;

  const ageDays = daysSince(typed.lastFirstPassAt, now);
  const recency = Number.isFinite(ageDays) ? Math.exp(-ageDays / WEAKNESS_DECAY_DAYS) : 0;
  const failureRate =
    typed.lifetimeFirstPassAttempts > 0
      ? typed.lifetimeFirstPassIncorrect / typed.lifetimeFirstPassAttempts
      : 0;
  const currentFailure = typed.latestFirstPassCorrect === false ? 1.15 * recency : 0;
  const unstable =
    typed.state === "NEEDS_PRACTICE"
      ? 0.55 * recency
      : typed.state === "MIXED"
      ? 0.3 * recency
      : 0;
  const repeatedErrors = Math.min(0.35, (evidence?.repeatedTypingErrorCount ?? 0) * 0.12) * recency;
  const historicalFailure = Math.min(0.45, failureRate * 0.45) * recency;

  return Math.min(3, 1 + currentFailure + unstable + repeatedErrors + historicalFailure);
}

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

/** Samples without replacement; one canonical card can never appear twice in a session. */
export function selectGlobalTypingCardIds(
  cards: readonly GlobalTypingCard[],
  evidenceByCardId: ReadonlyMap<string, GlobalTypingCandidateEvidence>,
  requestedCount: number,
  mode: Exclude<GlobalTypingQueueMode, "retry">,
  now: Date,
  random: RandomSource = Math.random
): string[] {
  const source =
    mode === "weak"
      ? cards.filter((card) => isRecentWeakEvidence(evidenceByCardId.get(card.id)?.typed, now))
      : cards;
  const count = Math.min(Math.max(0, requestedCount), source.length);
  if (count === 0) return [];

  // Exponential keys are a weighted random permutation. The selected set has
  // bounded preference for current weaknesses while preserving variety.
  const selected = source
    .map((card) => ({
      id: card.id,
      key: -Math.log(Math.max(Number.MIN_VALUE, random())) /
        globalTypingWeight(evidenceByCardId.get(card.id), now),
    }))
    .sort((a, b) => a.key - b.key || a.id.localeCompare(b.id))
    .slice(0, count)
    .map((item) => item.id);

  return shuffle(selected, random);
}

function toQuestion(
  card: GlobalTypingCard,
  index: number,
  cue: ProductionCue,
  config: TypingQuestionConfig = { idPrefix: "global_typing", mode: GLOBAL_TYPING_MODE }
): ServerTypedViEnQuizQuestion {
  if (cue.tier === "excluded") {
    throw new Error("Global typing queue received an unsafe Vietnamese cue.");
  }
  return {
    id: `q_${config.idPrefix}_${card.id}_${index}_${Date.now()}`,
    cardId: card.id,
    type: "typed_vi_en",
    prompt: cue.prompt,
    promptDetail: cue.promptDetail,
    ...(cue.context ? { cueContext: cue.context } : {}),
    correctAnswer: card.term,
    options: [],
    explanation: {
      term: card.term,
      ipa: card.ipa,
      partOfSpeech: card.partOfSpeech,
      meaningVi: card.meaningVi,
      definitionEn: card.definitionEn,
      exampleEn: card.exampleEn,
      exampleVi: card.exampleVi,
    },
    collisionSiblingTargets: cue.collisionSiblingTargets,
    letterHint: createRandomLetterHint(card.term).maskedAnswer,
    mode: config.mode,
  };
}

export class GlobalTypingPracticeService {
  async createSession(
    options: {
      mode?: GlobalTypingQueueMode;
      count?: number;
      retrySessionId?: string;
    } = {},
    now: Date = new Date(),
    random: RandomSource = Math.random
  ): Promise<GlobalTypingSession> {
    const mode = options.mode ?? "all";
    const requestedCount = options.count ?? 10;
    const cards = await db.flashcard.findMany({
      // Historical duplicate groups deliberately have no canonical identity,
      // so they cannot silently create ambiguous global evidence.
      where: { canonicalVocabularyIdentity: { isNot: null } },
      select: {
        id: true,
        term: true,
        normalizedTerm: true,
        meaningVi: true,
        definitionEn: true,
        ipa: true,
        partOfSpeech: true,
        cefr: true,
        exampleEn: true,
        exampleVi: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (cards.length === 0) {
      return { sessionId: "", questions: [], totalEligible: 0, emptyReason: "no_vocabulary" };
    }

    const cuesByCardId = buildProductionCues(cards);
    const eligibleCards = cards.filter((card) => {
      const cue = cuesByCardId.get(card.id);
      return Boolean(normalizeProductionCue(card.meaningVi)) && cue?.tier !== "excluded";
    });
    if (eligibleCards.length === 0) {
      return { sessionId: "", questions: [], totalEligible: 0, emptyReason: "no_safe_cues" };
    }

    let selectedIds: string[];
    if (mode === "retry") {
      const retrySessionId = options.retrySessionId?.trim();
      if (!retrySessionId) {
        return { sessionId: "", questions: [], totalEligible: 0, emptyReason: "no_retry_cards" };
      }
      const failed = await db.practiceAttempt.findMany({
        where: {
          sessionId: retrySessionId,
          mode: { in: [GLOBAL_TYPING_MODE, GLOBAL_TYPING_ASSISTED_MODE] },
          attemptNumber: 1,
          correct: false,
        },
        select: { flashcardId: true },
        orderBy: { createdAt: "asc" },
      });
      const eligibleIds = new Set(eligibleCards.map((card) => card.id));
      selectedIds = shuffle(
        Array.from(new Set(failed.map((attempt) => attempt.flashcardId))).filter((id) => eligibleIds.has(id)),
        random
      ).slice(0, requestedCount);
      if (selectedIds.length === 0) {
        return { sessionId: "", questions: [], totalEligible: 0, emptyReason: "no_retry_cards" };
      }
    } else {
      const [typedEvidence, incorrectAttempts] = await Promise.all([
        practiceEvidenceService.getTypedChallengeEvidenceForFlashcardIds(
          eligibleCards.map((card) => card.id),
          { excludeAssistedGlobalTypingCorrect: true }
        ),
        db.practiceAttempt.findMany({
          where: {
            flashcardId: { in: eligibleCards.map((card) => card.id) },
            questionType: "typed_vi_en",
            attemptNumber: 1,
            correct: false,
          },
          select: { flashcardId: true, answer: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      const repeatedErrorsByCardId = new Map<string, number>();
      const answerSeenByCardId = new Map<string, Set<string>>();
      for (const attempt of incorrectAttempts) {
        const answers = answerSeenByCardId.get(attempt.flashcardId) ?? new Set<string>();
        const normalizedAnswer = attempt.answer.normalize("NFC").trim().toLocaleLowerCase();
        if (normalizedAnswer && answers.has(normalizedAnswer)) {
          repeatedErrorsByCardId.set(
            attempt.flashcardId,
            (repeatedErrorsByCardId.get(attempt.flashcardId) ?? 0) + 1
          );
        }
        answers.add(normalizedAnswer);
        answerSeenByCardId.set(attempt.flashcardId, answers);
      }
      const evidenceByCardId = new Map<string, GlobalTypingCandidateEvidence>(
        eligibleCards.map((card) => [
          card.id,
          {
            typed: typedEvidence.get(card.id),
            repeatedTypingErrorCount: repeatedErrorsByCardId.get(card.id) ?? 0,
          },
        ])
      );
      selectedIds = selectGlobalTypingCardIds(
        eligibleCards,
        evidenceByCardId,
        requestedCount,
        mode,
        now,
        random
      );
      if (selectedIds.length === 0) {
        return {
          sessionId: "",
          questions: [],
          totalEligible: 0,
          emptyReason: mode === "weak" ? "no_weak_cards" : "no_safe_cues",
        };
      }
    }

    const cardById = new Map(eligibleCards.map((card) => [card.id, card]));
    const questions = selectedIds.flatMap((cardId, index) => {
      const card = cardById.get(cardId);
      const cue = cuesByCardId.get(cardId);
      return card && cue ? [toQuestion(card, index, cue)] : [];
    });
    if (questions.length === 0) {
      return { sessionId: "", questions: [], totalEligible: 0, emptyReason: "no_safe_cues" };
    }

    const session = await db.quizSession.create({
      data: {
        deckId: null,
        questions: questions as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
      },
    });

    return {
      sessionId: session.id,
      // Global typing uses the same intentional, opt-in partial letter mask
      // as Due Typing; do not expose the legacy static spelling metadata.
      questions: questions.map(sanitizeProductionChallengeQuestionForClient),
      totalEligible: questions.length,
      emptyReason: null,
    };
  }

  /**
   * Uses the same read-only due-card queue as /review, then freezes its own
   * shuffled typing snapshot. It never calls the scheduled-review mutation.
   */
  async createDueSession(
    now: Date = new Date(),
    random: RandomSource = Math.random
  ): Promise<DueTypingSession> {
    const { dueCards } = await fsrsService.getReviewQueue({ newLimit: 0, now });
    if (dueCards.length === 0) {
      return { sessionId: "", questions: [], totalEligible: 0, emptyReason: "no_due_cards" };
    }

    const cuesByCardId = buildProductionCues(dueCards);
    const eligibleCards = dueCards.filter((card) => {
      const cue = cuesByCardId.get(card.id);
      return Boolean(normalizeProductionCue(card.meaningVi)) && cue?.tier !== "excluded";
    });
    if (eligibleCards.length === 0) {
      return { sessionId: "", questions: [], totalEligible: 0, emptyReason: "no_safe_cues" };
    }

    const questions = shuffle(eligibleCards, random).flatMap((card, index) => {
      const cue = cuesByCardId.get(card.id);
      return cue
        ? [toQuestion(card, index, cue, { idPrefix: "due_typing", mode: DUE_TYPING_MODE })]
        : [];
    });
    if (questions.length === 0) {
      return { sessionId: "", questions: [], totalEligible: 0, emptyReason: "no_safe_cues" };
    }

    const session = await db.quizSession.create({
      data: {
        deckId: null,
        questions: questions as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
      },
    });

    return {
      sessionId: session.id,
      // Due typing exposes no static spelling metadata. The only optional
      // support is the server-created partial letter mask above.
      questions: questions.map(sanitizeProductionChallengeQuestionForClient),
      totalEligible: questions.length,
      emptyReason: null,
    };
  }

  checkAnswer(payload: { sessionId: string; questionId: string; answer: string }) {
    return quizService.checkQuestionAnswer(null, payload);
  }

  async checkDueAnswer(payload: { sessionId: string; questionId: string; answer: string }) {
    await this.assertDueSession(payload.sessionId);
    return this.checkAnswer(payload);
  }

  async submitDueSession(payload: QuizSubmissionPayload): Promise<QuizSubmissionResult> {
    await this.assertDueSession(payload.sessionId);
    return this.submit(payload);
  }

  async recordHint(sessionId: string, questionId: string): Promise<void> {
    await db.$transaction(async (tx) => {
      const session = await tx.quizSession.findUnique({ where: { id: sessionId } });
      if (!session || session.deckId !== null || session.expiresAt <= new Date()) {
        throw new Error("Phiên luyện gõ không hợp lệ hoặc đã hết hạn. Hãy tạo lượt mới.");
      }
      if (!Array.isArray(session.questions)) {
        throw new Error("Phiên luyện gõ bị lỗi. Hãy tạo lượt mới.");
      }
      let found = false;
      const questions = session.questions.map((question) => {
        if (
          typeof question !== "object" ||
          question === null ||
          !("id" in question) ||
          question.id !== questionId ||
          !("type" in question) ||
          question.type !== "typed_vi_en"
        ) {
          return question;
        }
        if (question.mode === DUE_TYPING_MODE) {
          throw new Error("Phiên luyện gõ từ đến hạn không dùng gợi ý chính tả.");
        }
        found = true;
        return { ...question, mode: GLOBAL_TYPING_ASSISTED_MODE };
      });
      if (!found) {
        throw new Error("Câu hỏi không tồn tại trong phiên luyện gõ hiện tại.");
      }
      await tx.quizSession.update({
        where: { id: session.id },
        data: { questions: questions as Prisma.InputJsonValue },
      });
    });
  }

  submit(payload: QuizSubmissionPayload): Promise<QuizSubmissionResult> {
    return quizService.submitQuizResult(null, payload);
  }

  private async assertDueSession(sessionId: string): Promise<void> {
    const session = await db.quizSession.findUnique({ where: { id: sessionId } });
    if (
      !session ||
      session.deckId !== null ||
      session.expiresAt <= new Date() ||
      !Array.isArray(session.questions) ||
      session.questions.length === 0 ||
      !session.questions.every(isStoredDueTypingQuestion)
    ) {
      throw new QuizSubmissionError("Phiên luyện gõ từ đến hạn không hợp lệ. Hãy tạo lượt mới.");
    }
  }
}

export const globalTypingPracticeService = new GlobalTypingPracticeService();
