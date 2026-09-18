import { db } from "@/lib/db";
import { Flashcard, FlashcardStatus } from "@prisma/client";

export type QuizQuestionType =
  | "multiple_choice_en_vi"
  | "multiple_choice_vi_en"
  | "fill_in_blank";

export interface QuizQuestion {
  id: string;
  cardId: string;
  type: QuizQuestionType;
  prompt: string;
  promptDetail?: string;
  correctAnswer: string;
  options: string[];
  explanation: {
    term: string;
    ipa?: string | null;
    partOfSpeech?: string | null;
    meaningVi: string;
    definitionEn: string;
    exampleEn: string;
    exampleVi: string;
  };
}

export interface QuizSubmissionPayload {
  score: number;
  total: number;
  cardResults: {
    cardId: string;
    correct: boolean;
  }[];
  updateCardStatus?: boolean;
}

export interface QuizSubmissionResult {
  attemptId: string;
  deckId: string;
  score: number;
  total: number;
  accuracy: number;
  cardsUpdatedCount: number;
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
    count = 10,
    allowedTypes: QuizQuestionType[] = [
      "multiple_choice_en_vi",
      "multiple_choice_vi_en",
      "fill_in_blank",
    ]
  ): QuizQuestion[] {
    if (!cards || cards.length === 0) {
      return [];
    }

    const shuffledCards = shuffleArray(cards);
    const selectedCards = shuffledCards.slice(0, Math.min(count, cards.length));
    const questions: QuizQuestion[] = [];

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

      if (chosenType === "fill_in_blank") {
        const { maskedSentence, found } = maskSentenceWithTerm(card.exampleEn, card.term);
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
   * Generates quiz for a deck by ID.
   */
  async getDeckQuiz(deckId: string, count = 10): Promise<{ deck: { id: string; name: string }; questions: QuizQuestion[] }> {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      include: {
        cards: true,
      },
    });

    if (!deck) {
      throw new Error("Không tìm thấy bộ thẻ.");
    }

    if (deck.cards.length === 0) {
      throw new Error("Bộ thẻ này chưa có từ vựng nào để tạo bài quiz.");
    }

    const questions = this.generateQuestions(deck.cards, count);

    return {
      deck: { id: deck.id, name: deck.name },
      questions,
    };
  }

  /**
   * Submits quiz results, writes a QuizAttempt record, and conditionally updates flashcard statuses.
   */
  async submitQuizResult(deckId: string, payload: QuizSubmissionPayload): Promise<QuizSubmissionResult> {
    const { score, total, cardResults, updateCardStatus = true } = payload;

    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { id: true },
    });

    if (!deck) {
      throw new Error("Bộ thẻ không tồn tại.");
    }

    const accuracy = total > 0 ? Number(((score / total) * 100).toFixed(1)) : 0;

    // 1. Create quiz attempt
    const attempt = await db.quizAttempt.create({
      data: {
        deckId,
        score,
        total,
        accuracy,
      },
    });

    // 2. Optionally update flashcards
    let cardsUpdatedCount = 0;
    if (updateCardStatus && cardResults && cardResults.length > 0) {
      const updates = cardResults.map(async ({ cardId, correct }) => {
        // If correct -> reinforce to KNOWN
        // If incorrect -> downgrade/flag to LEARNING
        const targetStatus: FlashcardStatus = correct ? FlashcardStatus.KNOWN : FlashcardStatus.LEARNING;

        await db.flashcard.updateMany({
          where: { id: cardId, deckId },
          data: { status: targetStatus },
        });
      });

      await Promise.all(updates);
      cardsUpdatedCount = cardResults.length;
    }

    return {
      attemptId: attempt.id,
      deckId,
      score,
      total,
      accuracy,
      cardsUpdatedCount,
    };
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
