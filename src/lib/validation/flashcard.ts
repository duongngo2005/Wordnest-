import { z } from "zod";

export const CefrEnum = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export type CefrLevel = z.infer<typeof CefrEnum>;

export const cefrLevelSchema = CefrEnum.nullable().optional().default(null);

export const generatedFlashcardItemSchema = z.object({
  term: z.string().min(1),
  meaningVi: z.string().min(1, "Vietnamese meaning is required"),
  definitionEn: z.string().min(1, "English definition is required"),
  ipa: z.string().nullable().optional().default(null),
  partOfSpeech: z.string().nullable().optional().default(null),
  cefr: cefrLevelSchema,
  exampleEn: z.string().min(1, "English example is required"),
  exampleVi: z.string().min(1, "Vietnamese example translation is required"),
  imageUseful: z.boolean().default(false),
  imageSearchQuery: z.string().nullable().optional().default(null),
});

export const aiBatchFlashcardResponseSchema = z.object({
  flashcards: z.array(generatedFlashcardItemSchema),
});

export type GeneratedFlashcardItem = z.infer<typeof generatedFlashcardItemSchema>;
export type AIBatchFlashcardResponse = z.infer<typeof aiBatchFlashcardResponseSchema>;

export const generateDeckRequestSchema = z.object({
  deckName: z.string().trim().optional(),
  rawInput: z.string().min(1, "Vui lòng nhập ít nhất một từ hoặc cụm từ"),
});

export type GenerateDeckRequest = z.infer<typeof generateDeckRequestSchema>;
