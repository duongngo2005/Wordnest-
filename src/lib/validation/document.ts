import { z } from "zod";

export const extractedVocabularyItemSchema = z.object({
  term: z.string().min(1),
  meaning: z.string().min(1),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).default("B1"),
  frequency: z.number().int().min(1).default(1),
  originalSentence: z.string().min(1),
});

export type ExtractedVocabularyItem = z.infer<typeof extractedVocabularyItemSchema>;

export const aiExtractedVocabularyResponseSchema = z.array(extractedVocabularyItemSchema);

export const generateCardsFromImportSchema = z.object({
  deckId: z.string().optional(),
  deckName: z.string().optional(),
  items: z
    .array(
      z.object({
        term: z.string().min(1),
        meaning: z.string().optional(),
        cefr: z.string().optional(),
        originalSentence: z.string().optional(),
      })
    )
    .min(1, "Vui lòng chọn ít nhất một từ vựng để tạo thẻ ghi nhớ"),
});

export type GenerateCardsFromImportInput = z.infer<typeof generateCardsFromImportSchema>;
