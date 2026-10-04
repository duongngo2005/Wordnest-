import { describe, expect, it, vi } from "vitest";
import { ExplainService, SimpleMutex } from "./explain-service";
import { explainAnswerRequestSchema, aiExplanationResponseSchema } from "@/lib/validation/explain";
import { db } from "@/lib/db";
import type { AIService } from "./ai-service";

describe("ExplainService & Explain Answer Validation", () => {
  describe("Zod Validation Schemas", () => {
    it("validates request with practiceAttemptId", () => {
      const parsed = explainAnswerRequestSchema.safeParse({
        practiceAttemptId: "att-123",
        userAnswer: "bad answer",
        expectedAnswer: "good answer",
      });
      expect(parsed.success).toBe(true);
    });

    it("validates request with sessionId and questionId", () => {
      const parsed = explainAnswerRequestSchema.safeParse({
        sessionId: "sess-1",
        questionId: "q-1",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects request without practiceAttemptId and without (sessionId + questionId)", () => {
      const parsed = explainAnswerRequestSchema.safeParse({
        userAnswer: "wrong",
      });
      expect(parsed.success).toBe(false);
    });

    it("validates structured AI explanation schema", () => {
      const validAiOutput = {
        errorType: "confusion",
        misconception: "Bạn nhầm lẫn giữa dedicate và delicate vì phát âm gần giống.",
        explanation: "Dedicate mang nghĩa cống hiến hoặc dành thời gian/tâm sức cho một mục tiêu.",
        correctUsage: "He dedicated his life to science.",
        tip: "Nhớ từ 'dedicate' qua chữ 'de' trong devote (cống hiến).",
        examples: ["She dedicated her book to her parents."],
      };

      const parsed = aiExplanationResponseSchema.safeParse(validAiOutput);
      expect(parsed.success).toBe(true);
    });

    it("rejects invalid AI explanation missing required fields", () => {
      const invalidAiOutput = {
        misconception: "Lỗi",
        // missing explanation, correctUsage, tip
      };
      const parsed = aiExplanationResponseSchema.safeParse(invalidAiOutput);
      expect(parsed.success).toBe(false);
    });
  });

  describe("SimpleMutex", () => {
    it("serializes concurrent tasks in order", async () => {
      const mutex = new SimpleMutex();
      const executionOrder: number[] = [];

      const task1 = mutex.runExclusive(async () => {
        await new Promise((res) => setTimeout(res, 30));
        executionOrder.push(1);
        return "result1";
      });

      const task2 = mutex.runExclusive(async () => {
        await new Promise((res) => setTimeout(res, 10));
        executionOrder.push(2);
        return "result2";
      });

      const [r1, r2] = await Promise.all([task1, task2]);
      expect(r1).toBe("result1");
      expect(r2).toBe("result2");
      // task1 must finish before task2 even though task2 is faster
      expect(executionOrder).toEqual([1, 2]);
    });
  });

  describe("Caching Behavior", () => {
    it("caches AI explanations in-memory and avoids duplicate AI calls", async () => {
      let callCount = 0;
      const mockAiService: Partial<AIService> = {
        callStructured: vi.fn().mockImplementation(async () => {
          callCount++;
          return {
            errorType: "lexical",
            misconception: "Nhầm lẫn từ vựng",
            explanation: "Giải thích chi tiết",
            correctUsage: "Cách dùng đúng",
            tip: "Mẹo ghi nhớ",
            examples: ["Ví dụ 1"],
          };
        }),
      };

      const explainService = new ExplainService(mockAiService as AIService);

      vi.spyOn(db.practiceAttempt, "findUnique").mockResolvedValue({
        id: "attempt-xyz",
        flashcardId: "card-123",
        questionType: "typed_vi_en",
        prompt: "xứng đáng, tương xứng",
        answer: "comparable",
        expectedAnswer: "commensurate",
        flashcard: {
          id: "card-123",
          term: "commensurate",
          meaningVi: "tương xứng",
          definitionEn: "corresponding in size or degree",
          exampleEn: "Salary is commensurate with experience.",
          exampleVi: "Lương tương xứng với kinh nghiệm.",
        },
      } as never);

      // Call 1
      const res1 = await explainService.explainMistake({
        practiceAttemptId: "attempt-xyz",
        userAnswer: "comparable",
        expectedAnswer: "commensurate",
      });

      expect(res1.explanation.misconception).toBe("Nhầm lẫn từ vựng");
      expect(callCount).toBe(1);
      expect(res1.cached).toBe(false);

      // Call 2 with same practiceAttemptId
      const res2 = await explainService.explainMistake({
        practiceAttemptId: "attempt-xyz",
        userAnswer: "comparable",
        expectedAnswer: "commensurate",
      });

      expect(res2.explanation.misconception).toBe("Nhầm lẫn từ vựng");
      // callCount should remain 1 because it was served from memory cache!
      expect(callCount).toBe(1);
      expect(res2.cached).toBe(true);
    });
  });
});
