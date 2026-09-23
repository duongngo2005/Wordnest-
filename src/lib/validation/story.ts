import { z } from "zod";

export const StoryCefrEnum = z.enum(["A1", "A2", "B1", "B2", "C1"]);
export type StoryCefr = z.infer<typeof StoryCefrEnum>;

export const StoryLengthEnum = z.enum(["short", "medium", "long"]);
export type StoryLength = z.infer<typeof StoryLengthEnum>;

export const StoryTopicEnum = z.enum([
  "Daily Life",
  "IT",
  "Travel",
  "Mystery",
  "Fantasy",
  "Random",
]);
export type StoryTopic = z.infer<typeof StoryTopicEnum>;

export const generateStoryRequestSchema = z.object({
  deckId: z.string().min(1, "deckId is required"),
  targetWords: z.array(z.string().min(1)).min(1, "Vui lòng chọn ít nhất một từ vựng để tạo câu chuyện"),
  cefr: StoryCefrEnum.default("B1"),
  length: StoryLengthEnum.default("medium"),
  topic: StoryTopicEnum.default("Daily Life"),
});

export type GenerateStoryRequest = z.infer<typeof generateStoryRequestSchema>;

export const aiStoryResponseSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  // Kept optional so older provider responses can still be read during rollout.
  wordsUsed: z.array(z.string()).optional().default([]),
  usage: z
    .array(
      z
        .object({
          term: z.string().trim().min(1).max(200),
          usedAs: z.string().trim().min(1).max(200),
        })
        .strict()
    )
    .optional()
    .default([]),
  // This is an enhancement, never a prerequisite for a valid Story.
  contextualTranslations: z.array(z.unknown()).optional(),
});

export type AIStoryResponse = z.infer<typeof aiStoryResponseSchema>;

export const translateInContextRequestSchema = z.object({
  storyId: z.string().min(1, "storyId is required"),
  deckId: z.string().min(1, "deckId is required"),
  selectedText: z.string().min(1, "Từ/cụm từ bôi đen không được để trống"),
  canonicalTerm: z.string().min(1).optional(),
  surroundingSentence: z.string().min(1, "Câu ngữ cảnh không được để trống"),
  context: z.string().optional().default(""),
});

export type TranslateInContextRequest = z.infer<typeof translateInContextRequestSchema>;

export const contextualTranslationResponseSchema = z.object({
  selectedText: z.string().min(1),
  meaningVi: z.string().min(1),
  contextualMeaningVi: z.string().min(1),
  definitionVi: z.string().nullable().optional().default(null),
  ipa: z.string().nullable().optional().default(null),
  partOfSpeech: z.string().nullable().optional().default(null),
  definitionEn: z.string().min(1),
  exampleEn: z.string().min(1),
  exampleVi: z.string().min(1),
  cefr: z.string().nullable().optional().default(null),
});

export type ContextualTranslationResponse = z.infer<typeof contextualTranslationResponseSchema>;

export const addCardFromStoryRequestSchema = z.object({
  deckId: z.string().min(1),
  term: z.string().min(1),
  meaningVi: z.string().min(1),
  definitionEn: z.string().min(1),
  ipa: z.string().nullable().optional(),
  partOfSpeech: z.string().nullable().optional(),
  cefr: z.string().nullable().optional(),
  exampleEn: z.string().min(1),
  exampleVi: z.string().min(1),
});

export type AddCardFromStoryRequest = z.infer<typeof addCardFromStoryRequestSchema>;
