import { z } from "zod";

export const aiStoryComprehensionQuestionSchema = z.object({
  prompt: z.string().trim().min(5).max(500),
  options: z.array(z.string().trim().min(1).max(200)).length(4),
  correctAnswer: z.string().trim().min(1).max(200),
  explanation: z.string().trim().min(5).max(1000),
});

export const aiStoryContextualVocabQuestionSchema = z.object({
  term: z.string().trim().min(1).max(100),
  sentence: z.string().trim().min(5).max(1000).optional(),
  prompt: z.string().trim().min(5).max(500),
  options: z.array(z.string().trim().min(1).max(200)).length(4),
  correctAnswer: z.string().trim().min(1).max(200),
  explanation: z.string().trim().min(5).max(1000),
});

export const aiStoryExerciseSetSchema = z.object({
  comprehension: z.array(aiStoryComprehensionQuestionSchema).max(3).default([]),
  contextualVocabulary: z.array(aiStoryContextualVocabQuestionSchema).max(3).default([]),
});

export type AIStoryComprehensionQuestion = z.infer<typeof aiStoryComprehensionQuestionSchema>;
export type AIStoryContextualVocabQuestion = z.infer<typeof aiStoryContextualVocabQuestionSchema>;
export type AIStoryExerciseSet = z.infer<typeof aiStoryExerciseSetSchema>;
