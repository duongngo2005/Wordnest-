import { z } from "zod";

export const quizSubmissionSchema = z.object({
  score: z.number().int().min(0),
  total: z.number().int().min(1),
  cardResults: z.array(
    z.object({
      cardId: z.string().min(1),
      correct: z.boolean(),
    })
  ).default([]),
  updateCardStatus: z.boolean().optional().default(true),
});

export type QuizSubmissionInput = z.infer<typeof quizSubmissionSchema>;
