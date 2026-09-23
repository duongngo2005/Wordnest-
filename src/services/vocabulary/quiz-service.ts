import { db } from "@/lib/db";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { MAX_QUIZ_RESPONSE_MS, type QuizSubmissionInput } from "@/lib/validation/quiz";
import { normalizeStoryVocabulary } from "@/lib/story/story-vocabulary";
import {
  createStoryClozePrompt,
  extractSentenceContainingUsageWithBoundary,
} from "@/lib/story/story-context";
import { Flashcard, Prisma } from "@prisma/client";
import { z } from "zod";
import { practiceEvidenceService } from "./practice-evidence-service";

export const TYPED_ANSWER_NORMALIZATION_VERSION = 1;

/**
 * Normalizes an answer string for deterministic comparison (v1).
 *
 * Rules:
 * 1. Unicode normalization (NFC)
 * 2. Case-insensitive (lowercase)
 * 3. Normalize curly/smart apostrophes and backticks to standard straight apostrophe (')
 * 4. Normalize curly double quotes to straight double quotes
 * 5. Collapse internal whitespace sequences (\s+ -> single space)
 * 6. Strip insignificant outer/edge punctuation (.,!?:;"'()[]{})
 * 7. Trim leading/trailing whitespace
 */
export function normalizeTypedAnswer(input: string): string {
  if (!input) return "";

  let normalized = input.normalize("NFC").toLowerCase();

  // Normalize curly single quotes, apostrophes, and backticks to standard straight apostrophe (')
  normalized = normalized.replace(/[\u2018\u2019\u201A\u201B\u2032\u0060\u00B4]/g, "'");

  // Normalize curly double quotes to straight double quotes
  normalized = normalized.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"');

  // Collapse internal whitespace and trim
  normalized = normalized.replace(/\s+/g, " ").trim();

  // Strip insignificant edge punctuation (preserve internal hyphens, apostrophes, etc.)
  normalized = normalized.replace(/^[\s.,!?:;"'()[\]{}]+|[\s.,!?:;"'()[\]{}]+$/g, "");

  // Re-collapse and trim in case stripping outer punctuation exposed extra spaces
  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * Deterministic comparison between user answer and expected answer.
 */
export function isTypedAnswerMatch(answer: string, expectedAnswer: string): boolean {
  const normAnswer = normalizeTypedAnswer(answer);
  const normExpected = normalizeTypedAnswer(expectedAnswer);
  if (!normAnswer || !normExpected) return false;
  return normAnswer === normExpected;
}

export type ChoiceQuestionType =
  | "multiple_choice_en_vi"
  | "multiple_choice_vi_en"
  | "fill_in_blank";

export type QuizQuestionType =
  | ChoiceQuestionType
  | "typed_vi_en"
  | "story_cloze";

export interface QuizQuestionExplanation {
  term: string;
  ipa?: string | null;
  partOfSpeech?: string | null;
  meaningVi: string;
  definitionEn: string | null;
  exampleEn: string | null;
  exampleVi: string | null;
}

export interface ChoiceQuizQuestion {
  id: string;
  cardId: string;
  type: ChoiceQuestionType;
  prompt: string;
  promptDetail?: string;
  correctAnswer: string;
  options: string[];
  explanation: QuizQuestionExplanation;
  mode?: string;
  selectionReason?: string;
}

export interface TypedViEnQuizQuestion {
  id: string;
  cardId: string;
  type: "typed_vi_en";
  prompt: string;
  promptDetail?: string;
  options?: never;
  correctAnswer?: never;
  explanation?: never;
  mode?: string;
  selectionReason?: string;
}

export interface StoryClozeQuizQuestion {
  id: string;
  cardId: string;
  storyId?: string;
  storyTitle?: string;
  type: "story_cloze";
  prompt: string;
  promptDetail?: string;
  options?: never;
  correctAnswer?: never;
  explanation?: never;
  mode?: string;
  selectionReason?: string;
}

export type TypedQuizQuestion = TypedViEnQuizQuestion | StoryClozeQuizQuestion;

export type ServerChoiceQuizQuestion = ChoiceQuizQuestion;

export interface ServerTypedViEnQuizQuestion {
  id: string;
  cardId: string;
  type: "typed_vi_en";
  prompt: string;
  promptDetail?: string;
  correctAnswer: string;
  options: string[];
  explanation: QuizQuestionExplanation;
  mode?: string;
  selectionReason?: string;
}

export interface ServerStoryClozeQuizQuestion {
  id: string;
  cardId: string;
  storyId?: string;
  storyTitle?: string;
  type: "story_cloze";
  prompt: string;
  promptDetail?: string;
  term: string;
  usedAs: string;
  correctAnswer: string;
  options: string[];
  explanation: QuizQuestionExplanation;
  mode?: string;
  selectionReason?: string;
}

export type ServerTypedQuizQuestion = ServerTypedViEnQuizQuestion | ServerStoryClozeQuizQuestion;

export type ServerQuizQuestion = ServerChoiceQuizQuestion | ServerTypedQuizQuestion;

export type QuizQuestion = ChoiceQuizQuestion | TypedQuizQuestion;

export function sanitizeQuizQuestionForClient(question: ServerQuizQuestion): QuizQuestion {
  if (question.type === "typed_vi_en") {
    return {
      id: question.id,
      cardId: question.cardId,
      type: "typed_vi_en",
      prompt: question.prompt,
      promptDetail: question.promptDetail,
      selectionReason: question.selectionReason,
      mode: question.mode,
    };
  }

  if (question.type === "story_cloze") {
    return {
      id: question.id,
      cardId: question.cardId,
      storyId: question.storyId,
      storyTitle: question.storyTitle,
      type: "story_cloze",
      prompt: question.prompt,
      selectionReason: question.selectionReason,
      mode: question.mode,
    };
  }

  return {
    id: question.id,
    cardId: question.cardId,
    type: question.type,
    prompt: question.prompt,
    promptDetail: question.promptDetail,
    options: question.options,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    selectionReason: question.selectionReason,
    mode: question.mode,
  };
}

export type QuizSubmissionPayload = QuizSubmissionInput;

export interface QuizSubmissionResult {
  attemptId: string;
  deckId: string;
  score: number;
  total: number;
  accuracy: number;
  firstPassScore?: number;
  firstPassTotal?: number;
  retryScore?: number;
  retryTotal?: number;
  cardsUpdatedCount: number;
}

const storedQuizQuestionSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  type: z.enum([
    "multiple_choice_en_vi",
    "multiple_choice_vi_en",
    "fill_in_blank",
    "typed_vi_en",
    "story_cloze",
  ]),
  prompt: z.string().optional(),
  correctAnswer: z.string(),
  mode: z.string().optional(),
  selectionReason: z.string().optional(),
});

const storedQuizQuestionsSchema = z.array(storedQuizQuestionSchema).min(1);

const QUIZ_SESSION_DURATION_MS = 30 * 60 * 1000;

export class QuizSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizSubmissionError";
  }
}

const FALLBACK_DISTRACTORS: { term: string; meaningVi: string }[] = [
  { term: "resilient", meaningVi: "kiên cường, phục hồi nhanh" },
  { term: "meticulous", meaningVi: "tỉ mỉ, cẩn trọng từng chi tiết" },
  { term: "versatile", meaningVi: "đa năng, linh hoạt" },
  { term: "innovative", meaningVi: "sáng tạo, có tính đổi mới" },
  { term: "empathy", meaningVi: "sự thấu cảm, khả năng đồng cảm" },
  { term: "clarity", meaningVi: "sự rõ ràng, rành mạch" },
  { term: "diligent", meaningVi: "chăm chỉ, siêng năng" },
  { term: "pinnacle", meaningVi: "đỉnh cao, tột đỉnh" },
  { term: "eloquent", meaningVi: "lưu loát, hùng biện lôi cuốn" },
  { term: "pragmatic", meaningVi: "thực tế, mang tính thực tiễn" },
  { term: "serendipity", meaningVi: "sự tình cờ may mắn" },
  { term: "lucid", meaningVi: "rõ ràng, sáng suốt, dễ hiểu" },
  { term: "tenacious", meaningVi: "kiên trì, bền bỉ đến cùng" },
  { term: "ephemeral", meaningVi: "ngắn ngủi, phù du, thoáng qua" },
  { term: "ubiquitous", meaningVi: "phổ biến khắp nơi, đâu đâu cũng thấy" },
];

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Creates a fill-in-the-blank prompt by masking the target term in the example sentence.
 */
export function maskSentenceWithTerm(sentence: string, term: string): { maskedSentence: string; found: boolean } {
  if (!sentence || !term) {
    return { maskedSentence: sentence || "", found: false };
  }

  // Escape regex special chars in term
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match word boundary if possible, or exact substring
  const regex = new RegExp(`\\b${escaped}\\b`, "i");

  if (regex.test(sentence)) {
    return {
      maskedSentence: sentence.replace(regex, "______"),
      found: true,
    };
  }

  // Fallback: match without word boundaries for inflected words or phrases
  const substringRegex = new RegExp(escaped, "i");
  if (substringRegex.test(sentence)) {
    return {
      maskedSentence: sentence.replace(substringRegex, "______"),
      found: true,
    };
  }

  return { maskedSentence: sentence, found: false };
}

export class QuizService {
  /**
   * Generates a randomized list of quiz questions from given flashcards.
   */
  generateQuestions(
    cards: Flashcard[],
    count?: number,
    allowedTypes?: ChoiceQuestionType[]
  ): ServerChoiceQuizQuestion[];
  generateQuestions(
    cards: Flashcard[],
    count?: number,
    allowedTypes?: QuizQuestionType[]
  ): ServerQuizQuestion[];
  generateQuestions(
    cards: Flashcard[],
    count = 10,
    allowedTypes: QuizQuestionType[] = [
      "multiple_choice_en_vi",
      "multiple_choice_vi_en",
      "fill_in_blank",
    ]
  ): ServerQuizQuestion[] {
    if (!cards || cards.length === 0) {
      return [];
    }

    const shuffledCards = shuffleArray(cards);
    const selectedCards = shuffledCards.slice(0, Math.min(count, cards.length));
    const questions: ServerQuizQuestion[] = [];

    // Helper pools for distractors
    const allTerms = Array.from(new Set(cards.map((c) => c.term.trim())));
    const allMeanings = Array.from(new Set(cards.map((c) => c.meaningVi.trim())));

    for (let i = 0; i < selectedCards.length; i++) {
      const card = selectedCards[i];
      const questionId = `q_${card.id}_${i}_${Date.now()}`;

      // Pick question type based on card properties and allowed types
      const availableTypesForCard = allowedTypes.filter((type) => {
        if (type === "fill_in_blank") {
          return card.exampleEn && card.exampleEn.length > 5;
        }
        return true;
      });

      const chosenType =
        availableTypesForCard.length > 0
          ? availableTypesForCard[Math.floor(Math.random() * availableTypesForCard.length)]
          : "multiple_choice_en_vi";

      const explanation = {
        term: card.term,
        ipa: card.ipa,
        partOfSpeech: card.partOfSpeech,
        meaningVi: card.meaningVi,
        definitionEn: card.definitionEn,
        exampleEn: card.exampleEn,
        exampleVi: card.exampleVi,
      };

      if (chosenType === "typed_vi_en") {
        const detailParts: string[] = [];
        if (card.partOfSpeech) detailParts.push(card.partOfSpeech);
        if (card.cefr) detailParts.push(`CEFR ${card.cefr}`);

        questions.push({
          id: questionId,
          cardId: card.id,
          type: "typed_vi_en",
          prompt: card.meaningVi,
          promptDetail: detailParts.length > 0 ? detailParts.join(" • ") : undefined,
          correctAnswer: card.term,
          options: [],
          explanation,
        });
      } else if (chosenType === "fill_in_blank") {
        const { maskedSentence, found } = maskSentenceWithTerm(card.exampleEn ?? "", card.term);
        const finalPrompt = found ? maskedSentence : `Điền từ thích hợp vào chỗ trống: [ ${card.meaningVi} ]`;

        const distractors = this.getDistractors(card.term, allTerms, FALLBACK_DISTRACTORS.map((f) => f.term), 3);
        const options = shuffleArray([card.term, ...distractors]);

        questions.push({
          id: questionId,
          cardId: card.id,
          type: "fill_in_blank",
          prompt: finalPrompt,
          promptDetail: card.partOfSpeech
            ? `Nghĩa: ${card.meaningVi} • (${card.partOfSpeech})`
            : `Nghĩa: ${card.meaningVi}`,
          correctAnswer: card.term,
          options,
          explanation,
        });
      } else if (chosenType === "multiple_choice_vi_en") {
        const distractors = this.getDistractors(card.term, allTerms, FALLBACK_DISTRACTORS.map((f) => f.term), 3);
        const options = shuffleArray([card.term, ...distractors]);

        const detailParts: string[] = [];
        if (card.partOfSpeech) detailParts.push(card.partOfSpeech);
        if (card.cefr) detailParts.push(`CEFR ${card.cefr}`);

        questions.push({
          id: questionId,
          cardId: card.id,
          type: "multiple_choice_vi_en",
          prompt: card.meaningVi,
          promptDetail: detailParts.length > 0 ? detailParts.join(" • ") : undefined,
          correctAnswer: card.term,
          options,
          explanation,
        });
      } else {
        // multiple_choice_en_vi
        const distractors = this.getDistractors(
          card.meaningVi,
          allMeanings,
          FALLBACK_DISTRACTORS.map((f) => f.meaningVi),
          3
        );
        const options = shuffleArray([card.meaningVi, ...distractors]);

        const detailParts: string[] = [];
        if (card.ipa) detailParts.push(card.ipa);
        if (card.partOfSpeech) detailParts.push(card.partOfSpeech);

        questions.push({
          id: questionId,
          cardId: card.id,
          type: "multiple_choice_en_vi",
          prompt: card.term,
          promptDetail: detailParts.length > 0 ? detailParts.join(" • ") : undefined,
          correctAnswer: card.meaningVi,
          options,
          explanation,
        });
      }
    }

    return questions;
  }

  /**
   * Retrieves 3 distinct distractors that don't match the correct answer.
   */
  private getDistractors(
    correct: string,
    primaryPool: string[],
    fallbackPool: string[],
    count = 3
  ): string[] {
    const normalizedCorrect = correct.trim().toLowerCase();
    const uniquePool = Array.from(
      new Set(
        [...primaryPool, ...fallbackPool].filter(
          (item) => item && item.trim().toLowerCase() !== normalizedCorrect
        )
      )
    );

    const shuffled = shuffleArray(uniquePool);
    return shuffled.slice(0, count);
  }

  /**
   * Generates contextual typed cloze questions from a Story and deck cards.
   * Deterministic, zero AI, exact surface form matching.
   */
  generateStoryClozeQuestions(
    story: { id: string; title: string; content: string; targetWords: unknown },
    cards: Flashcard[]
  ): ServerStoryClozeQuizQuestion[] {
    if (!story || !story.content || !cards || cards.length === 0) {
      return [];
    }

    const vocabulary = normalizeStoryVocabulary(story.targetWords);
    if (!vocabulary.usage || vocabulary.usage.length === 0) {
      return [];
    }

    // Index flashcards by term and normalizedTerm
    const cardByTerm = new Map<string, Flashcard>();
    for (const card of cards) {
      cardByTerm.set(card.term.trim().toLowerCase(), card);
      if (card.normalizedTerm) {
        cardByTerm.set(card.normalizedTerm.trim().toLowerCase(), card);
      }
    }

    const questions: ServerStoryClozeQuizQuestion[] = [];
    const usedCardIds = new Set<string>();

    for (let i = 0; i < vocabulary.usage.length; i++) {
      const usage = vocabulary.usage[i];
      const term = usage.term?.trim();
      const usedAs = usage.usedAs?.trim();
      if (!term || !usedAs) continue;

      const card = cardByTerm.get(term.toLowerCase());
      if (!card || usedCardIds.has(card.id)) continue;

      // Deterministic sentence extraction with word/phrase boundary
      const sentence = extractSentenceContainingUsageWithBoundary(story.content, usedAs);
      if (!sentence) continue;

      // Cloze creation replacing exact usedAs with '______'
      const { clozeSentence, found } = createStoryClozePrompt(sentence, usedAs);
      if (!found || clozeSentence === sentence) continue;

      usedCardIds.add(card.id);
      const questionId = `q_sc_${card.id}_${i}_${Date.now()}`;

      questions.push({
        id: questionId,
        cardId: card.id,
        storyId: story.id,
        storyTitle: story.title,
        type: "story_cloze",
        prompt: clozeSentence,
        term: card.term,
        usedAs,
        correctAnswer: usedAs, // EXACT usedAs
        options: [],
        explanation: {
          term: card.term,
          ipa: card.ipa,
          partOfSpeech: card.partOfSpeech,
          meaningVi: card.meaningVi,
          definitionEn: card.definitionEn,
          exampleEn: sentence, // Contextual sentence from the story
          exampleVi: card.exampleVi,
        },
      });
    }

    return questions;
  }

  /**
   * Generates quiz for a deck by ID.
   */
  getDeckQuiz(
    deckId: string,
    count?: number
  ): Promise<{ deck: { id: string; name: string }; sessionId: string; questions: ChoiceQuizQuestion[] }>;
  getDeckQuiz(
    deckId: string,
    count: number,
    allowedTypes: ChoiceQuestionType[]
  ): Promise<{ deck: { id: string; name: string }; sessionId: string; questions: ChoiceQuizQuestion[] }>;
  getDeckQuiz(
    deckId: string,
    count: number,
    allowedTypes: QuizQuestionType[],
    storyId?: string
  ): Promise<{ deck: { id: string; name: string }; sessionId: string; questions: QuizQuestion[] }>;
  async getDeckQuiz(
    deckId: string,
    count = 10,
    allowedTypes: QuizQuestionType[] = [
      "multiple_choice_en_vi",
      "multiple_choice_vi_en",
      "fill_in_blank",
    ],
    storyId?: string
  ): Promise<{ deck: { id: string; name: string }; sessionId: string; questions: QuizQuestion[] }> {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      include: {
        cards: true,
      },
    });

    if (!deck) {
      throw new ResourceNotFoundError("Không tìm thấy bộ thẻ.");
    }

    if (deck.cards.length === 0) {
      throw new Error("Bộ thẻ này chưa có từ vựng nào để tạo bài quiz.");
    }

    let questions: ServerQuizQuestion[];

    if (allowedTypes.includes("story_cloze")) {
      const story = storyId
        ? await db.story.findUnique({ where: { id: storyId } })
        : await db.story.findFirst({ where: { deckId }, orderBy: { createdAt: "desc" } });

      if (!story || story.deckId !== deckId) {
        throw new Error("Không tìm thấy câu chuyện nào để tạo bài tập Cloze.");
      }

      const clozeQuestions = this.generateStoryClozeQuestions(story, deck.cards);
      if (clozeQuestions.length === 0) {
        throw new Error("Không có từ phù hợp để tạo bài Cloze từ Story này.");
      }

      const safeCount = Math.max(1, Math.min(count, clozeQuestions.length));
      questions = clozeQuestions.slice(0, safeCount);
    } else {
      const safeCount = Math.max(1, Math.min(count, 30));
      questions = this.generateQuestions(deck.cards, safeCount, allowedTypes);
    }

    const session = await db.quizSession.create({
      data: {
        deckId,
        questions: questions as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + QUIZ_SESSION_DURATION_MS),
      },
    });

    return {
      deck: { id: deck.id, name: deck.name },
      sessionId: session.id,
      questions: questions.map(sanitizeQuizQuestionForClient),
    };
  }

  /**
   * Generates a Focused Practice quiz session (Phase 3B).
   * - Selects candidates strictly from NEEDS_PRACTICE and MIXED practice evidence.
   * - Generates targeted questions based on the modality where the learner struggled.
   * - Safe fallback to typed_vi_en if story context cannot be resolved.
   * - Labels all questions with mode = "focused_practice" and selectionReason.
   * - Freezes question snapshot in QuizSession (client cannot tamper with candidate set).
   */
  async getFocusedPracticeQuiz(
    deckId: string,
    count = 10
  ): Promise<{
    deck: { id: string; name: string };
    sessionId: string;
    questions: QuizQuestion[];
    totalEligible: number;
  }> {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      include: { cards: true },
    });

    if (!deck) {
      throw new ResourceNotFoundError("Không tìm thấy bộ thẻ.");
    }

    const candidates = await practiceEvidenceService.getFocusedPracticeCandidates(
      deckId,
      Math.max(1, Math.min(count, 30))
    );

    if (candidates.length === 0) {
      return {
        deck: { id: deck.id, name: deck.name },
        sessionId: "",
        questions: [],
        totalEligible: 0,
      };
    }

    const allCards = deck.cards;
    const allTerms = Array.from(new Set(allCards.map((c) => c.term.trim())));
    const allMeanings = Array.from(new Set(allCards.map((c) => c.meaningVi.trim())));

    const questions: ServerQuizQuestion[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const card = candidate.card;
      const questionId = `q_focused_${card.id}_${i}_${Date.now()}`;
      const mode = "focused_practice";
      const selectionReason = candidate.selectionReason;

      const explanation = {
        term: card.term,
        ipa: card.ipa,
        partOfSpeech: card.partOfSpeech,
        meaningVi: card.meaningVi,
        definitionEn: card.definitionEn ?? null,
        exampleEn: card.exampleEn ?? null,
        exampleVi: card.exampleVi ?? null,
      };

      if (candidate.targetQuestionType === "story_cloze") {
        // Compatibility guard: historical evidence may still carry this type,
        // but a focused session must never reactivate parked Story Cloze.
        const detailParts: string[] = [];
        if (card.partOfSpeech) detailParts.push(card.partOfSpeech);
        if (card.cefr) detailParts.push(`CEFR ${card.cefr}`);
        questions.push({
          id: questionId,
          cardId: card.id,
          type: "typed_vi_en",
          prompt: card.meaningVi,
          promptDetail: detailParts.length > 0 ? detailParts.join(" • ") : undefined,
          correctAnswer: card.term,
          options: [],
          explanation,
          mode,
          selectionReason: `${selectionReason} (Gõ từ)`,
        });
      } else if (candidate.targetQuestionType === "fill_in_blank") {
        const { maskedSentence, found } = maskSentenceWithTerm(card.exampleEn ?? "", card.term);
        const finalPrompt = found ? maskedSentence : `Điền từ thích hợp vào chỗ trống: [ ${card.meaningVi} ]`;
        const distractors = this.getDistractors(card.term, allTerms, FALLBACK_DISTRACTORS.map((f) => f.term), 3);
        const options = shuffleArray([card.term, ...distractors]);

        questions.push({
          id: questionId,
          cardId: card.id,
          type: "fill_in_blank",
          prompt: finalPrompt,
          promptDetail: card.partOfSpeech
            ? `Nghĩa: ${card.meaningVi} • (${card.partOfSpeech})`
            : `Nghĩa: ${card.meaningVi}`,
          correctAnswer: card.term,
          options,
          explanation,
          mode,
          selectionReason,
        });
      } else if (candidate.targetQuestionType === "multiple_choice_vi_en") {
        const distractors = this.getDistractors(card.term, allTerms, FALLBACK_DISTRACTORS.map((f) => f.term), 3);
        const options = shuffleArray([card.term, ...distractors]);

        const detailParts: string[] = [];
        if (card.partOfSpeech) detailParts.push(card.partOfSpeech);
        if (card.cefr) detailParts.push(`CEFR ${card.cefr}`);

        questions.push({
          id: questionId,
          cardId: card.id,
          type: "multiple_choice_vi_en",
          prompt: card.meaningVi,
          promptDetail: detailParts.length > 0 ? detailParts.join(" • ") : undefined,
          correctAnswer: card.term,
          options,
          explanation,
          mode,
          selectionReason,
        });
      } else if (candidate.targetQuestionType === "multiple_choice_en_vi") {
        const distractors = this.getDistractors(
          card.meaningVi,
          allMeanings,
          FALLBACK_DISTRACTORS.map((f) => f.meaningVi),
          3
        );
        const options = shuffleArray([card.meaningVi, ...distractors]);

        const detailParts: string[] = [];
        if (card.ipa) detailParts.push(card.ipa);
        if (card.partOfSpeech) detailParts.push(card.partOfSpeech);

        questions.push({
          id: questionId,
          cardId: card.id,
          type: "multiple_choice_en_vi",
          prompt: card.term,
          promptDetail: detailParts.length > 0 ? detailParts.join(" • ") : undefined,
          correctAnswer: card.meaningVi,
          options,
          explanation,
          mode,
          selectionReason,
        });
      } else {
        // typed_vi_en (Active Recall Default)
        const detailParts: string[] = [];
        if (card.partOfSpeech) detailParts.push(card.partOfSpeech);
        if (card.cefr) detailParts.push(`CEFR ${card.cefr}`);

        questions.push({
          id: questionId,
          cardId: card.id,
          type: "typed_vi_en",
          prompt: card.meaningVi,
          promptDetail: detailParts.length > 0 ? detailParts.join(" • ") : undefined,
          correctAnswer: card.term,
          options: [],
          explanation,
          mode,
          selectionReason,
        });
      }
    }

    const session = await db.quizSession.create({
      data: {
        deckId,
        questions: questions as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + QUIZ_SESSION_DURATION_MS),
      },
    });

    return {
      deck: { id: deck.id, name: deck.name },
      sessionId: session.id,
      questions: questions.map(sanitizeQuizQuestionForClient),
      totalEligible: candidates.length,
    };
  }

  /**
   * Evaluates a single question answer without mutating FSRS or claiming the session.
   */
  async checkQuestionAnswer(
    deckId: string,
    payload: { sessionId: string; questionId: string; answer: string }
  ): Promise<{
    questionId: string;
    cardId: string;
    correct: boolean;
    expectedAnswer: string;
    explanation: QuizQuestionExplanation;
  }> {
    const session = await db.quizSession.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.deckId !== deckId || session.expiresAt <= new Date()) {
      throw new QuizSubmissionError("Phiên quiz không hợp lệ hoặc đã hết hạn. Vui lòng tạo bài quiz mới.");
    }

    const questions = session.questions as unknown as ServerQuizQuestion[];
    if (!Array.isArray(questions)) {
      throw new QuizSubmissionError("Phiên quiz bị lỗi. Vui lòng tạo bài quiz mới.");
    }

    const question = questions.find((q) => q.id === payload.questionId);
    if (!question) {
      throw new QuizSubmissionError("Câu hỏi không tồn tại trong phiên quiz hiện tại.");
    }

    const isCorrect =
      question.type === "typed_vi_en" || question.type === "story_cloze"
        ? isTypedAnswerMatch(payload.answer, question.correctAnswer)
        : payload.answer.trim().toLocaleLowerCase() ===
          question.correctAnswer.trim().toLocaleLowerCase();

    return {
      questionId: question.id,
      cardId: question.cardId,
      correct: isCorrect,
      expectedAnswer: question.correctAnswer,
      explanation: question.explanation,
    };
  }

  /**
   * Scores answers against the server-created quiz session and writes a QuizAttempt.
   * Quiz is practice-only: it never changes FSRS scheduler state.
   */
  async submitQuizResult(deckId: string, payload: QuizSubmissionPayload): Promise<QuizSubmissionResult> {
    return db.$transaction(async (tx) => {
      const session = await tx.quizSession.findUnique({
        where: { id: payload.sessionId },
      });

      if (!session || session.deckId !== deckId || session.expiresAt <= new Date()) {
        throw new QuizSubmissionError("Phiên quiz không hợp lệ hoặc đã hết hạn. Vui lòng tạo bài quiz mới.");
      }

      const questions = storedQuizQuestionsSchema.safeParse(session.questions);
      if (!questions.success) {
        throw new QuizSubmissionError("Phiên quiz bị lỗi. Vui lòng tạo bài quiz mới.");
      }

      const questionsMap = new Map(questions.data.map((q) => [q.id, q]));
      const expectedIds = new Set(questions.data.map((question) => question.id));

      for (const answer of payload.answers) {
        if (!questionsMap.has(answer.questionId)) {
          throw new QuizSubmissionError("Câu hỏi không tồn tại trong phiên quiz hiện tại.");
        }
        const attemptNum = answer.attemptNumber ?? 1;
        if (attemptNum !== 1 && attemptNum !== 2) {
          throw new QuizSubmissionError("Lượt làm bài không hợp lệ.");
        }
        if (
          answer.responseMs !== undefined &&
          (!Number.isInteger(answer.responseMs) ||
            answer.responseMs < 0 ||
            answer.responseMs > MAX_QUIZ_RESPONSE_MS)
        ) {
          throw new QuizSubmissionError("Thời gian trả lời quiz không hợp lệ.");
        }
      }

      const firstPassAnswers = payload.answers.filter((a) => (a.attemptNumber ?? 1) === 1);
      const retryAnswers = payload.answers.filter((a) => a.attemptNumber === 2);

      const firstPassIds = new Set(firstPassAnswers.map((a) => a.questionId));
      if (
        firstPassIds.size !== firstPassAnswers.length ||
        firstPassIds.size !== expectedIds.size ||
        [...firstPassIds].some((id) => !expectedIds.has(id))
      ) {
        throw new QuizSubmissionError("Câu trả lời lượt đầu không khớp với phiên hiện tại.");
      }

      const answerByQuestionId = new Map(firstPassAnswers.map((answer) => [answer.questionId, answer]));
      const firstPassResults = questions.data.map((question) => {
        const submitted = answerByQuestionId.get(question.id);
        if (!submitted) {
          throw new QuizSubmissionError("Câu trả lời quiz không khớp với phiên hiện tại.");
        }

        const isCorrect =
          question.type === "typed_vi_en" || question.type === "story_cloze"
            ? isTypedAnswerMatch(submitted.answer, question.correctAnswer)
            : submitted.answer.trim().toLocaleLowerCase() ===
              question.correctAnswer.trim().toLocaleLowerCase();

        return {
          cardId: question.cardId,
          questionId: question.id,
          prompt: question.prompt ?? null,
          attemptNumber: 1,
          mode: question.mode ?? "quiz",
          questionType: question.type,
          correct: isCorrect,
          answer: submitted.answer.trim(),
          expectedAnswer: question.correctAnswer,
          responseMs: submitted.responseMs,
        };
      });

      const firstPassResultMap = new Map(firstPassResults.map((r) => [r.questionId, r]));
      const retryIds = new Set(retryAnswers.map((a) => a.questionId));
      if (retryIds.size !== retryAnswers.length) {
        throw new QuizSubmissionError("Có câu hỏi làm lại bị trùng lặp.");
      }

      const retryResults = retryAnswers.map((submitted) => {
        const question = questionsMap.get(submitted.questionId)!;
        const firstPassResult = firstPassResultMap.get(submitted.questionId);

        if (!firstPassResult) {
          throw new QuizSubmissionError("Không tìm thấy lượt làm đầu tiên của câu hỏi làm lại.");
        }
        if (firstPassResult.correct) {
          throw new QuizSubmissionError("Không thể làm lại câu hỏi đã trả lời đúng trong lượt đầu.");
        }

        const isCorrect =
          question.type === "typed_vi_en" || question.type === "story_cloze"
            ? isTypedAnswerMatch(submitted.answer, question.correctAnswer)
            : submitted.answer.trim().toLocaleLowerCase() ===
              question.correctAnswer.trim().toLocaleLowerCase();

        return {
          cardId: question.cardId,
          questionId: question.id,
          prompt: question.prompt ?? null,
          attemptNumber: 2,
          mode: question.mode ?? "quiz",
          questionType: question.type,
          correct: isCorrect,
          answer: submitted.answer.trim(),
          expectedAnswer: question.correctAnswer,
          responseMs: submitted.responseMs,
        };
      });

      const firstPassTotal = firstPassResults.length;
      const firstPassScore = firstPassResults.filter((result) => result.correct).length;
      const firstPassAccuracy = Number(((firstPassScore / firstPassTotal) * 100).toFixed(1));

      const retryTotal = retryResults.length;
      const retryScore = retryResults.filter((result) => result.correct).length;

      // Claim the one-use session before writing any evidence. If another
      // submission consumed it first, this transaction rolls back without a
      // duplicate summary or per-question records.
      const claimedSession = await tx.quizSession.deleteMany({
        where: { id: session.id },
      });
      if (claimedSession.count !== 1) {
        throw new QuizSubmissionError("Phiên quiz đã được gửi. Vui lòng tạo bài quiz mới.");
      }

      // QuizAttempt preserves FIRST-PASS aggregate performance only
      const attempt = await tx.quizAttempt.create({
        data: {
          deckId,
          score: firstPassScore,
          total: firstPassTotal,
          accuracy: firstPassAccuracy,
        },
      });

      const allResults = [...firstPassResults, ...retryResults];
      const practiceAttempts = await tx.practiceAttempt.createMany({
        data: allResults.map((result) => ({
          flashcardId: result.cardId,
          sessionId: session.id,
          questionId: result.questionId,
          prompt: result.prompt,
          attemptNumber: result.attemptNumber,
          mode: result.mode ?? "quiz",
          questionType: result.questionType,
          correct: result.correct,
          answer: result.answer,
          expectedAnswer: result.expectedAnswer,
          responseMs: result.responseMs,
        })),
      });

      if (practiceAttempts.count !== allResults.length) {
        throw new QuizSubmissionError("Không thể lưu đầy đủ bằng chứng luyện tập.");
      }

      return {
        attemptId: attempt.id,
        deckId,
        score: firstPassScore,
        total: firstPassTotal,
        accuracy: firstPassAccuracy,
        firstPassScore,
        firstPassTotal,
        retryScore,
        retryTotal,
        cardsUpdatedCount: 0,
      };
    });
  }

  /**
   * Retrieves quiz history for a deck.
   */
  async getDeckQuizHistory(deckId: string) {
    return db.quizAttempt.findMany({
      where: { deckId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }
}

export const quizService = new QuizService();
