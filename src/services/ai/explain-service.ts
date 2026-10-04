import { db } from "@/lib/db";
import { ResourceNotFoundError } from "@/lib/http/errors";
import {
  aiExplanationResponseSchema,
  type AIExplanationResponse,
  type ExplainAnswerRequestInput,
} from "@/lib/validation/explain";
import { aiService, type AIService } from "./ai-service";
import { AIProviderUnavailableError } from "./ai-core";

interface CanonicalExplainContext {
  cardId: string;
  term: string;
  meaningVi: string;
  definitionEn?: string | null;
  partOfSpeech?: string | null;
  cefr?: string | null;
  exampleEn?: string | null;
  exampleVi?: string | null;
  questionType: string;
  prompt?: string | null;
  userAnswer: string;
  expectedAnswer: string;
}

// In-memory cache for generated explanations (keyed by cardId + userAnswer + expectedAnswer)
const explanationCache = new Map<string, AIExplanationResponse>();

// Lightweight mutex to serialize interactive AI requests to local Ollama
export class SimpleMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

const explainMutex = new SimpleMutex();

export interface ExplainMistakeResult {
  explanation: AIExplanationResponse;
  cached: boolean;
}

export class ExplainService {
  constructor(private readonly ai: AIService = aiService) {}

  /**
   * Generates or retrieves a cached AI explanation for an incorrect answer.
   * Completely on-demand and bounded by canonical Flashcard data.
   */
  async explainMistake(input: ExplainAnswerRequestInput): Promise<ExplainMistakeResult> {
    const context = await this.resolveCanonicalContext(input);

    const cacheKey = input.practiceAttemptId
      ? `att:${input.practiceAttemptId}`
      : input.sessionId && input.questionId
      ? `sess:${input.sessionId}:${input.questionId}:${(input.userAnswer ?? "").trim().toLowerCase()}`
      : `${context.cardId}:${context.questionType}:${context.userAnswer.trim().toLowerCase()}:${context.expectedAnswer.trim().toLowerCase()}`;
    const cached = explanationCache.get(cacheKey);
    if (cached) {
      return { explanation: cached, cached: true };
    }

    const explanation = await explainMutex.runExclusive(async () => {
      // Recheck cache inside lock in case a concurrent request already populated it
      const existing = explanationCache.get(cacheKey);
      if (existing) return existing;

      return this.callOllamaExplanation(context);
    });

    explanationCache.set(cacheKey, explanation);
    return { explanation, cached: false };
  }

  private async resolveCanonicalContext(
    input: ExplainAnswerRequestInput
  ): Promise<CanonicalExplainContext> {
    // Strategy 1: Resolve by practiceAttemptId (Primary for Mistake Bank & QuizResults)
    if (input.practiceAttemptId) {
      const attempt = await db.practiceAttempt.findUnique({
        where: { id: input.practiceAttemptId },
        include: { flashcard: true },
      });

      if (!attempt) {
        throw new ResourceNotFoundError("Không tìm thấy bản ghi câu trả lời.");
      }

      if (attempt.correct) {
        throw new Error("Câu trả lời này đã chính xác, không cần giải thích lỗi sai.");
      }

      return {
        cardId: attempt.flashcardId,
        term: attempt.flashcard.term,
        meaningVi: attempt.flashcard.meaningVi,
        definitionEn: attempt.flashcard.definitionEn,
        partOfSpeech: attempt.flashcard.partOfSpeech,
        cefr: attempt.flashcard.cefr,
        exampleEn: attempt.flashcard.exampleEn,
        exampleVi: attempt.flashcard.exampleVi,
        questionType: attempt.questionType,
        prompt: attempt.prompt,
        userAnswer: attempt.answer,
        expectedAnswer: attempt.expectedAnswer,
      };
    }

    // Strategy 2: Resolve by sessionId & questionId
    if (input.sessionId && input.questionId) {
      // Check if attempt was already created for this session
      const savedAttempt = await db.practiceAttempt.findFirst({
        where: { sessionId: input.sessionId, questionId: input.questionId },
        include: { flashcard: true },
      });

      if (savedAttempt) {
        return {
          cardId: savedAttempt.flashcardId,
          term: savedAttempt.flashcard.term,
          meaningVi: savedAttempt.flashcard.meaningVi,
          definitionEn: savedAttempt.flashcard.definitionEn,
          partOfSpeech: savedAttempt.flashcard.partOfSpeech,
          cefr: savedAttempt.flashcard.cefr,
          exampleEn: savedAttempt.flashcard.exampleEn,
          exampleVi: savedAttempt.flashcard.exampleVi,
          questionType: savedAttempt.questionType,
          prompt: savedAttempt.prompt,
          userAnswer: savedAttempt.answer,
          expectedAnswer: savedAttempt.expectedAnswer,
        };
      }

      // If quiz is still in progress, look up from active QuizSession
      const session = await db.quizSession.findUnique({
        where: { id: input.sessionId },
      });

      if (!session) {
        throw new ResourceNotFoundError("Không tìm thấy phiên làm bài kiểm tra.");
      }

      const questions = session.questions as unknown as Array<{
        id: string;
        cardId: string;
        type: string;
        prompt?: string;
        correctAnswer: string;
      }>;

      const matchedQuestion = Array.isArray(questions)
        ? questions.find((q) => q.id === input.questionId)
        : null;

      if (!matchedQuestion) {
        throw new ResourceNotFoundError("Không tìm thấy câu hỏi trong phiên kiểm tra.");
      }

      if (!matchedQuestion.cardId) {
        return {
          cardId: "",
          term: "Đọc hiểu câu chuyện",
          meaningVi: "Đọc hiểu nội dung văn bản trong truyện",
          questionType: matchedQuestion.type,
          prompt: matchedQuestion.prompt,
          userAnswer: input.userAnswer || "",
          expectedAnswer: matchedQuestion.correctAnswer,
        };
      }

      const card = await db.flashcard.findUnique({
        where: { id: matchedQuestion.cardId },
      });

      if (!card) {
        throw new ResourceNotFoundError("Không tìm thấy thẻ từ vựng liên kết.");
      }

      return {
        cardId: card.id,
        term: card.term,
        meaningVi: card.meaningVi,
        definitionEn: card.definitionEn,
        partOfSpeech: card.partOfSpeech,
        cefr: card.cefr,
        exampleEn: card.exampleEn,
        exampleVi: card.exampleVi,
        questionType: matchedQuestion.type,
        prompt: matchedQuestion.prompt,
        userAnswer: input.userAnswer || "",
        expectedAnswer: matchedQuestion.correctAnswer,
      };
    }

    throw new Error("Dữ liệu yêu cầu giải thích không hợp lệ.");
  }

  private async callOllamaExplanation(
    context: CanonicalExplainContext
  ): Promise<AIExplanationResponse> {
    const systemPrompt =
      "Bạn là trợ lý giáo dục ngôn ngữ Anh-Việt xuất sắc của WordNest. Nhiệm vụ của bạn là giải thích ngắn gọn, thân thiện và súc tích vì sao người học trả lời chưa đúng, phân tích nguyên nhân nhầm lẫn và đưa ra cách dùng đúng cùng mẹo ghi nhớ. Bạn phải phản hồi bằng định dạng JSON hợp lệ duy nhất tuân thủ schema được cung cấp.";

    const promptDetails = [
      `Từ vựng gốc: "${context.term}"`,
      context.partOfSpeech ? `Từ loại: ${context.partOfSpeech}` : null,
      context.cefr ? `Cấp độ: CEFR ${context.cefr}` : null,
      `Nghĩa tiếng Việt chuẩn: "${context.meaningVi}"`,
      context.definitionEn ? `Định nghĩa tiếng Anh: "${context.definitionEn}"` : null,
      context.exampleEn ? `Câu ví dụ chuẩn: "${context.exampleEn}"` : null,
      context.exampleVi ? `Dịch câu ví dụ: "${context.exampleVi}"` : null,
      context.prompt ? `Đề bài / Câu hỏi: "${context.prompt}"` : null,
      `Dạng bài: ${context.questionType}`,
      `Câu trả lời của người học: "${context.userAnswer}"`,
      `Đáp án đúng: "${context.expectedAnswer}"`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `Hãy phân tích lỗi sai sau đây của người học và giải thích bằng tiếng Việt tự nhiên:
${promptDetails}

Yêu cầu nội dung:
1. errorType: Loại lỗi sai ngắn gọn (ví dụ: "Nhầm từ vựng", "Sai thì/dạng từ", "Sai giới từ/cụm từ", "Nhầm từ đồng nghĩa").
2. misconception: 1-2 câu chỉ ra người học có thể đã nhầm lẫn điều gì giữa "${context.userAnswer}" và "${context.expectedAnswer}".
3. explanation: 2-3 câu giải thích rõ ngữ cảnh và lý do vì sao "${context.expectedAnswer}" mới là lựa chọn đúng.
4. correctUsage: Cấu trúc hoặc cách dùng đúng nhất của từ/cụm từ (ngắn gọn dưới 10 từ).
5. tip: 1 mẹo ghi nhớ ngắn gọn, dễ nhớ (1 câu).
6. examples: 1 đến 2 câu ví dụ tiếng Anh tự nhiên chứa "${context.expectedAnswer}".

Phản hồi bằng JSON duy nhất khớp với schema:
{
  "errorType": "string",
  "misconception": "string",
  "explanation": "string",
  "correctUsage": "string",
  "tip": "string",
  "examples": ["string"]
}`;

    try {
      const result = await this.ai.callStructured({
        systemPrompt,
        prompt,
        schema: aiExplanationResponseSchema,
        temperature: 0.2,
        timeoutMs: 30_000,
        maxRetries: 1,
      });

      return result;
    } catch (error) {
      if (
        error instanceof AIProviderUnavailableError ||
        (error instanceof Error && /connect ECONNREFUSED|offline|unavailable/i.test(error.message))
      ) {
        throw new AIProviderUnavailableError(
          "Dịch vụ AI địa phương (Ollama) đang không khả dụng. Hãy chắc chắn container Ollama đang chạy."
        );
      }
      throw error;
    }
  }

  /** For unit testing / cache clearing */
  clearCache(): void {
    explanationCache.clear();
  }
}

export const explainService = new ExplainService();
