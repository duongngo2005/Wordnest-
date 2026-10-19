import { z } from "zod";

export const MAX_QUIZ_RESPONSE_MS = 86_400_000;
// Due typing permits up to 100 scheduled cards, with one retry for each question.
export const MAX_QUIZ_SUBMISSION_ANSWERS = 200;

export const quizSubmissionSchema = z.object({
  sessionId: z.string().min(1),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        attemptNumber: z.number().int().min(1).max(2).optional(),
        answer: z.string().min(1).max(5_000),
        responseMs: z.number().int().min(0).max(MAX_QUIZ_RESPONSE_MS).optional(),
      })
    )
    .min(1)
    .max(MAX_QUIZ_SUBMISSION_ANSWERS),
});

export type QuizSubmissionInput = z.infer<typeof quizSubmissionSchema>;

export const quizCheckSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  attemptNumber: z.number().int().min(1).max(2).optional(),
  answer: z.string().max(5_000),
  responseMs: z.number().int().min(0).max(MAX_QUIZ_RESPONSE_MS).optional(),
});

export type QuizCheckInput = z.infer<typeof quizCheckSchema>;
