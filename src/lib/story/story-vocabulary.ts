import { z } from "zod";
import {
  contextualTranslationResponseSchema,
  type ContextualTranslationResponse,
} from "@/lib/validation/story";

const storyVocabularyUsageSchema = z
  .object({
    term: z.string().trim().min(1).max(200),
    usedAs: z.string().trim().min(1).max(200),
  })
  .strict();

const storyVocabularyMetadataSchema = z
  .object({
    schemaVersion: z.literal(2),
    requestedTerms: z.array(z.string().trim().min(1).max(200)),
    usage: z.array(storyVocabularyUsageSchema),
  })
  .strict();

const storyContextualTranslationSchema = z
  .object({
    term: z.string().trim().min(1).max(200),
    usedAs: z.string().trim().min(1).max(200),
    meaningVi: z.string().trim().min(1).max(1_000),
  })
  .strict();

const storySelectionTranslationSchema = z
  .object({
    selectedText: z.string().trim().min(1).max(200),
    canonicalTerm: z.string().trim().min(1).max(200).nullable().optional().default(null),
    surroundingSentence: z.string().trim().min(1).max(5_000),
    translation: contextualTranslationResponseSchema,
  })
  .strict();

const storyVocabularyMetadataV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    requestedTerms: z.array(z.string().trim().min(1).max(200)),
    usage: z.array(storyVocabularyUsageSchema),
    contextualTranslations: z.array(storyContextualTranslationSchema).default([]),
    selectionTranslations: z.array(storySelectionTranslationSchema).default([]),
  })
  .strict();

export type StoryVocabularyUsage = z.infer<typeof storyVocabularyUsageSchema>;
export type StoryContextualTranslation = z.infer<typeof storyContextualTranslationSchema>;
export type StorySelectionTranslation = z.infer<typeof storySelectionTranslationSchema>;

export type StoryVocabulary = {
  requestedTerms: string[];
  usage: StoryVocabularyUsage[];
  contextualTranslations: StoryContextualTranslation[];
  selectionTranslations: StorySelectionTranslation[];
};

export type StoryVocabularyMetadata = StoryVocabulary & {
  schemaVersion: 3;
};

export function createStoryVocabularyMetadata(
  requestedTerms: string[],
  usage: StoryVocabularyUsage[],
  options: {
    contextualTranslations?: StoryContextualTranslation[];
    selectionTranslations?: StorySelectionTranslation[];
  } = {}
): StoryVocabularyMetadata {
  return {
    schemaVersion: 3,
    requestedTerms,
    usage,
    contextualTranslations: options.contextualTranslations || [],
    selectionTranslations: options.selectionTranslations || [],
  };
}

/** Filters optional AI/import enrichment without making the Story contract fail. */
export function normalizeStoryContextualTranslations(
  value: unknown,
  usage: StoryVocabularyUsage[]
): StoryContextualTranslation[] {
  const parsed = z.array(z.unknown()).safeParse(value);
  if (!parsed.success) return [];

  const normalize = (term: string) => term.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const usages = new Map(
    usage.map((item) => [`${normalize(item.term)}\u0000${normalize(item.usedAs)}`, item])
  );
  const seen = new Set<string>();
  const translations: StoryContextualTranslation[] = [];

  for (const rawEntry of parsed.data) {
    const entry = storyContextualTranslationSchema.safeParse(rawEntry);
    if (!entry.success) continue;
    const key = `${normalize(entry.data.term)}\u0000${normalize(entry.data.usedAs)}`;
    const matchingUsage = usages.get(key);
    if (!matchingUsage || seen.has(key)) continue;
    seen.add(key);
    translations.push({ ...entry.data, term: matchingUsage.term, usedAs: matchingUsage.usedAs });
  }

  return translations;
}

export function normalizeStoryVocabulary(value: unknown): StoryVocabulary {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    const requestedTerms = value.map((term) => term.trim()).filter(Boolean);
    return {
      requestedTerms,
      usage: requestedTerms.map((term) => ({ term, usedAs: term })),
      contextualTranslations: [],
      selectionTranslations: [],
    };
  }

  const parsedV3 = storyVocabularyMetadataV3Schema.safeParse(value);
  if (parsedV3.success) {
    return {
      requestedTerms: parsedV3.data.requestedTerms,
      usage: parsedV3.data.usage,
      contextualTranslations: parsedV3.data.contextualTranslations,
      selectionTranslations: parsedV3.data.selectionTranslations,
    };
  }

  const parsedV2 = storyVocabularyMetadataSchema.safeParse(value);
  if (parsedV2.success) {
    return {
      requestedTerms: parsedV2.data.requestedTerms,
      usage: parsedV2.data.usage,
      contextualTranslations: [],
      selectionTranslations: [],
    };
  }

  return { requestedTerms: [], usage: [], contextualTranslations: [], selectionTranslations: [] };
}

export type StoryTranslationCacheHit = {
  translation: ContextualTranslationResponse;
  canonicalTerm: string | null;
};
