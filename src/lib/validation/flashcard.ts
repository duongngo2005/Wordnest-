import { z } from "zod";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const PART_OF_SPEECH_OPTIONS = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "phrase",
  "phrasal verb",
  "noun phrase",
  "verb phrase",
  "adjective phrase",
  "other",
] as const;

export const CefrEnum = z.enum(CEFR_LEVELS);
const PartOfSpeechEnum = z.enum(PART_OF_SPEECH_OPTIONS);
export type CefrLevel = z.infer<typeof CefrEnum>;
export type PartOfSpeech = z.infer<typeof PartOfSpeechEnum>;

export const cefrLevelSchema = CefrEnum.nullable().optional().default(null);

// Browser form controls submit an empty string for an unselected optional value.
// Treat that as omitted for manual cards so their minimum contract stays term + meaningVi.
const optionalCefrLevel = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  CefrEnum.optional()
);

export const AUTO_IMAGE_MIN_SCORE = 75;

export const generatedFlashcardItemSchema = z
  .object({
    term: z.string().min(1),
    meaningVi: z.string().min(1, "Vietnamese meaning is required"),
    definitionEn: z.string().min(1, "English definition is required"),
    ipa: z.string().nullable().optional().default(null),
    partOfSpeech: z.string().nullable().optional().default(null),
    cefr: cefrLevelSchema,
    exampleEn: z.string().min(1, "English example is required"),
    exampleVi: z.string().min(1, "Vietnamese example translation is required"),
    visualScore: z.number().min(0).max(100).optional(),
    imageUseful: z.boolean().optional(),
    imageSearchQuery: z.string().nullable().optional().default(null),
  })
  .transform((data) => {
    // Resolve visualScore and backwards-compatible imageUseful
    const resolvedVisualScore =
      typeof data.visualScore === "number"
        ? data.visualScore
        : data.imageUseful
        ? 85
        : 0;

    const resolvedImageUseful = resolvedVisualScore >= AUTO_IMAGE_MIN_SCORE;

    return {
      ...data,
      visualScore: resolvedVisualScore,
      imageUseful: resolvedImageUseful,
      imageSearchQuery: resolvedImageUseful ? data.imageSearchQuery : null,
    };
  });

export const aiBatchFlashcardResponseSchema = z.object({
  flashcards: z.array(generatedFlashcardItemSchema),
});

export type GeneratedFlashcardItem = z.infer<typeof generatedFlashcardItemSchema>;
export type AIBatchFlashcardResponse = z.infer<typeof aiBatchFlashcardResponseSchema>;

const optionalText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional()
  );

const optionalNullableText = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(maxLength).nullable().optional()
  );

export function isSupportedPartOfSpeech(value: string): value is PartOfSpeech {
  return PART_OF_SPEECH_OPTIONS.includes(value as PartOfSpeech);
}

export const manualFlashcardItemSchema = z.object({
  term: z.string().trim().min(1, "Word is required").max(200),
  meaningVi: z.string().trim().min(1, "Vietnamese meaning is required").max(2_000),
  partOfSpeech: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    PartOfSpeechEnum.optional()
  ),
  ipa: optionalText(200),
  definitionEn: optionalText(2_000),
  exampleEn: optionalText(4_000),
  exampleVi: optionalText(4_000),
  cefr: optionalCefrLevel,
  imageUrl: optionalText(2_000),
});

export type ManualFlashcardItem = z.infer<typeof manualFlashcardItemSchema>;

/** Lexical-only boundary: scheduler and learning-history fields are not editable here. */
export const updateFlashcardRequestSchema = z
  .object({
    term: z.string().trim().min(1, "Thuật ngữ không được để trống.").max(200).optional(),
    meaningVi: z.string().trim().min(1, "Nghĩa tiếng Việt không được để trống.").max(2_000).optional(),
    definitionEn: optionalNullableText(2_000),
    ipa: optionalNullableText(200),
    partOfSpeech: optionalNullableText(100),
    cefr: optionalNullableText(10),
    exampleEn: optionalNullableText(4_000),
    exampleVi: optionalNullableText(4_000),
    imageUrl: optionalNullableText(2_000),
    imageSource: optionalNullableText(100),
    imageSearchQuery: optionalNullableText(2_000),
    imagePageUrl: optionalNullableText(2_000),
    imageAuthor: optionalNullableText(500),
    imageLicense: optionalNullableText(500),
  })
  .strict();

export type UpdateFlashcardRequest = z.infer<typeof updateFlashcardRequestSchema>;

export const manualCardsRequestSchema = z.object({
  cards: z.array(manualFlashcardItemSchema).min(1).max(30),
});

/** AI generation is intentionally smaller than direct JSON/manual imports. */
export const AI_CARD_GENERATION_LIMIT = 12;

export const aiCardGenerationRequestSchema = z.object({
  action: z.literal("generate"),
  rawInput: z.string().trim().min(1, "Nhập ít nhất một từ hoặc cụm từ.").max(4_000),
});

export const aiCardPersistRequestSchema = z.object({
  action: z.literal("persist"),
  cards: z.array(manualFlashcardItemSchema).min(1).max(AI_CARD_GENERATION_LIMIT),
});
