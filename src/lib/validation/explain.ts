import { z } from "zod";

export const explainAnswerRequestSchema = z
  .object({
    practiceAttemptId: z.string().trim().min(1).optional(),
    sessionId: z.string().trim().min(1).optional(),
    questionId: z.string().trim().min(1).optional(),
    userAnswer: z.string().trim().max(5_000).optional(),
    expectedAnswer: z.string().trim().max(5_000).optional(),
  })
  .refine(
    (data) => Boolean(data.practiceAttemptId || (data.sessionId && data.questionId)),
    {
      message: "Cần cung cấp practiceAttemptId hoặc cặp sessionId và questionId.",
    }
  );

export type ExplainAnswerRequestInput = z.infer<typeof explainAnswerRequestSchema>;

export const aiExplanationResponseSchema = z.object({
  errorType: z.string().nullable().optional(),
  misconception: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
  correctUsage: z.string().trim().min(1),
  tip: z.string().trim().min(1),
  examples: z.array(z.string().trim()).max(3).optional().default([]),
});

export type AIExplanationResponse = z.infer<typeof aiExplanationResponseSchema>;
