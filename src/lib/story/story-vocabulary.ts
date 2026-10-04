import { z } from "zod";
import {
  contextualTranslationResponseSchema,
  type ContextualTranslationResponse,
} from "@/lib/validation/story";
import { isCloudTtsVoiceId, type CloudTtsVoiceId } from "@/lib/tts/voice-catalog";

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

const storyNarrationSchema = z
  .object({
    // Cache keys are derived from the final story text and these voice IDs. Keeping
    // the relationship here lets Story deletion remove only its known narrations.
    voiceIds: z.array(z.string().refine(isCloudTtsVoiceId, "Unsupported narration voice")).default([]),
  })
  .strict();

const storyVocabularyMetadataV4Schema = z
  .object({
    schemaVersion: z.literal(4),
    requestedTerms: z.array(z.string().trim().min(1).max(200)),
    usage: z.array(storyVocabularyUsageSchema),
    contextualTranslations: z.array(storyContextualTranslationSchema).default([]),
    selectionTranslations: z.array(storySelectionTranslationSchema).default([]),
    narration: storyNarrationSchema.default({ voiceIds: [] }),
  })
  .strict();

export type StoryVocabularyUsage = z.infer<typeof storyVocabularyUsageSchema>;
export type StoryContextualTranslation = z.infer<typeof storyContextualTranslationSchema>;
export type StorySelectionTranslation = z.infer<typeof storySelectionTranslationSchema>;
export type StoryNarration = { voiceIds: CloudTtsVoiceId[] };

export type StoryVocabulary = {
  requestedTerms: string[];
  usage: StoryVocabularyUsage[];
  contextualTranslations: StoryContextualTranslation[];
  selectionTranslations: StorySelectionTranslation[];
  narration: StoryNarration;
};

export type StoryVocabularyMetadata = StoryVocabulary & {
  schemaVersion: 4;
};

export function createStoryVocabularyMetadata(
  requestedTerms: string[],
  usage: StoryVocabularyUsage[],
  options: {
    contextualTranslations?: StoryContextualTranslation[];
    selectionTranslations?: StorySelectionTranslation[];
    narration?: StoryNarration;
  } = {}
): StoryVocabularyMetadata {
  return {
    schemaVersion: 4,
    requestedTerms,
    usage,
    contextualTranslations: options.contextualTranslations || [],
    selectionTranslations: options.selectionTranslations || [],
    narration: options.narration || { voiceIds: [] },
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
      narration: { voiceIds: [] },
    };
  }

  const parsedV4 = storyVocabularyMetadataV4Schema.safeParse(value);
  if (parsedV4.success) {
    return {
      requestedTerms: parsedV4.data.requestedTerms,
      usage: parsedV4.data.usage,
      contextualTranslations: parsedV4.data.contextualTranslations,
      selectionTranslations: parsedV4.data.selectionTranslations,
      narration: { voiceIds: parsedV4.data.narration.voiceIds as CloudTtsVoiceId[] },
    };
  }

  const parsedV3 = storyVocabularyMetadataV3Schema.safeParse(value);
  if (parsedV3.success) {
    return {
      requestedTerms: parsedV3.data.requestedTerms,
      usage: parsedV3.data.usage,
      contextualTranslations: parsedV3.data.contextualTranslations,
      selectionTranslations: parsedV3.data.selectionTranslations,
      narration: { voiceIds: [] },
    };
  }

  const parsedV2 = storyVocabularyMetadataSchema.safeParse(value);
  if (parsedV2.success) {
    return {
      requestedTerms: parsedV2.data.requestedTerms,
      usage: parsedV2.data.usage,
      contextualTranslations: [],
      selectionTranslations: [],
      narration: { voiceIds: [] },
    };
  }

  return {
    requestedTerms: [],
    usage: [],
    contextualTranslations: [],
    selectionTranslations: [],
    narration: { voiceIds: [] },
  };
}

export type StoryTranslationCacheHit = {
  translation: ContextualTranslationResponse;
  canonicalTerm: string | null;
};

export type CoverageVocabularyTerm = {
  term: string;
  partOfSpeech?: string | null;
};

export type CoverageTermInput = string | CoverageVocabularyTerm;

const IRREGULAR_VERB_FORMS: Record<string, readonly string[]> = {
  be: ["am", "is", "are", "was", "were", "been", "being"],
  bring: ["brings", "brought", "bringing"],
  come: ["comes", "came", "coming"],
  do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone", "going"],
  have: ["has", "had", "having"],
  take: ["takes", "took", "taken", "taking"],
};

const PHRASAL_VERB_HEADS = new Set([
  "abide",
  "be",
  "bring",
  "call",
  "come",
  "follow",
  "get",
  "keep",
  "look",
  "set",
  "take",
]);

function normalizeCoverageText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function endsWithConsonantVowelConsonant(word: string): boolean {
  return /[^aeiou][aeiou][^aeiouwxy]$/i.test(word);
}

function createVerbForms(base: string): string[] {
  const normalized = base.toLocaleLowerCase();
  const forms = new Set<string>([normalized, ...(IRREGULAR_VERB_FORMS[normalized] || [])]);

  if (/[^aeiou]y$/i.test(normalized)) {
    forms.add(`${normalized.slice(0, -1)}ies`);
    forms.add(`${normalized.slice(0, -1)}ied`);
    forms.add(`${normalized}ing`);
  } else if (/e$/i.test(normalized)) {
    forms.add(`${normalized}s`);
    forms.add(`${normalized}d`);
    forms.add(`${normalized.slice(0, -1)}ing`);
  } else {
    forms.add(/(?:s|x|z|ch|sh|o)$/i.test(normalized) ? `${normalized}es` : `${normalized}s`);
    forms.add(`${normalized}ed`);
    forms.add(`${normalized}ing`);
  }

  if (endsWithConsonantVowelConsonant(normalized)) {
    const doubled = `${normalized}${normalized.at(-1)}`;
    forms.add(`${doubled}ed`);
    forms.add(`${doubled}ing`);
  }

  return [...forms];
}

function createNounForms(base: string): string[] {
  const normalized = base.toLocaleLowerCase();
  if (/[^aeiou]y$/i.test(normalized)) return [normalized, `${normalized.slice(0, -1)}ies`];
  if (/(?:s|x|z|ch|sh)$/i.test(normalized)) return [normalized, `${normalized}es`];
  return [normalized, `${normalized}s`];
}

function createSurfaceForms(term: string, partOfSpeech?: string | null): string[] {
  const normalizedTerm = normalizeCoverageText(term).toLocaleLowerCase();
  if (!normalizedTerm) return [];

  const words = normalizedTerm.split(" ");
  if (words.length > 1) {
    const [head, ...tail] = words;
    if (!PHRASAL_VERB_HEADS.has(head)) return [normalizedTerm];
    return createVerbForms(head).map((form) => [form, ...tail].join(" "));
  }

  const normalizedPos = partOfSpeech?.toLocaleLowerCase() || "";
  const forms = new Set<string>([normalizedTerm]);
  const isVerb = !normalizedPos || /verb/.test(normalizedPos);
  const isNoun = !normalizedPos || /noun/.test(normalizedPos);
  if (isVerb) createVerbForms(normalizedTerm).forEach((form) => forms.add(form));
  if (isNoun) createNounForms(normalizedTerm).forEach((form) => forms.add(form));
  return [...forms];
}

function extractTermInput(input: CoverageTermInput): CoverageVocabularyTerm {
  return typeof input === "string" ? { term: input } : input;
}

export type MatchedOccurrence = {
  term: string;
  usedAs: string;
  start: number;
  end: number;
  isExact: boolean;
};

export type SpanCollisionDiagnostic = {
  span: { start: number; end: number; text: string };
  competingTerms: string[];
  winnerTerm: string;
};

export type CoverageAnalysisResult = {
  totalTerms: number;
  matchedTerms: number;
  used: Array<{ term: string; usedAs: string; start?: number; end?: number }>;
  missing: string[];
  coveragePercent: number;
  collisions: SpanCollisionDiagnostic[];
};

function findCandidateOccurrences(
  normalizedContent: string,
  term: string,
  partOfSpeech?: string | null
): MatchedOccurrence[] {
  const normalizedTerm = normalizeCoverageText(term);
  if (!normalizedContent || !normalizedTerm) return [];
  const lowerBase = normalizedTerm.toLocaleLowerCase();

  const occurrences: MatchedOccurrence[] = [];
  const seenSpans = new Set<string>();

  for (const surfaceForm of createSurfaceForms(normalizedTerm, partOfSpeech)) {
    const escaped = escapeRegExp(surfaceForm);
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`, "giu");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalizedContent)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const spanKey = `${start}:${end}`;
      if (!seenSpans.has(spanKey)) {
        seenSpans.add(spanKey);
        const usedAs = match[1];
        const isExact = usedAs.toLocaleLowerCase() === lowerBase;
        occurrences.push({
          term,
          usedAs,
          start,
          end,
          isExact,
        });
      }
    }
  }

  return occurrences;
}

export function findWordInContent(
  content: string,
  term: string,
  partOfSpeech?: string | null
): string | null {
  const normalizedContent = normalizeCoverageText(content);
  const candidates = findCandidateOccurrences(normalizedContent, term, partOfSpeech);
  return candidates.length > 0 ? candidates[0].usedAs : null;
}

export function analyzeVocabularyCoverage(
  content: string,
  requestedTerms: readonly CoverageTermInput[]
): CoverageAnalysisResult {
  const normalizedContent = normalizeCoverageText(content);
  const uniqueTerms: CoverageVocabularyTerm[] = [];
  const seenTerms = new Set<string>();

  for (const input of requestedTerms) {
    const item = extractTermInput(input);
    const norm = normalizeCoverageText(item.term).toLocaleLowerCase();
    if (!seenTerms.has(norm)) {
      seenTerms.add(norm);
      uniqueTerms.push(item);
    }
  }

  // Prioritize multi-word expressions (e.g. phrasal verbs "call in") over single words ("call")
  // so that composite expressions claim their full span first during matching.
  const matchingOrder = [...uniqueTerms].sort((a, b) => {
    const wordsA = a.term.trim().split(/\s+/).length;
    const wordsB = b.term.trim().split(/\s+/).length;
    return wordsB - wordsA;
  });

  // 1. Find all candidate occurrences for each unique term
  const termCandidates = new Map<string, MatchedOccurrence[]>();
  for (const item of uniqueTerms) {
    const candidates = findCandidateOccurrences(normalizedContent, item.term, item.partOfSpeech);
    termCandidates.set(item.term, candidates);
  }

  // 2. Track claimed spans
  const claimedSpans: Array<{ start: number; end: number; term: string; usedAs: string }> = [];
  const overlaps = (start1: number, end1: number, start2: number, end2: number) =>
    start1 < end2 && start2 < end1;

  const isSpanClaimed = (start: number, end: number) =>
    claimedSpans.some((s) => overlaps(start, end, s.start, s.end));

  const assigned = new Map<string, MatchedOccurrence>();
  const collisions: SpanCollisionDiagnostic[] = [];

  // 3. Priority Pass 1: Exact canonical surface matches (isExact === true)
  for (const item of matchingOrder) {
    const exactCandidates = (termCandidates.get(item.term) || []).filter((c) => c.isExact);
    for (const cand of exactCandidates) {
      if (!isSpanClaimed(cand.start, cand.end)) {
        claimedSpans.push({ start: cand.start, end: cand.end, term: item.term, usedAs: cand.usedAs });
        assigned.set(item.term, cand);
        break;
      }
    }
  }

  // 4. Priority Pass 2: Morphology-derived matches (isExact === false) for terms not yet assigned
  for (const item of matchingOrder) {
    if (assigned.has(item.term)) continue;

    const derivedCandidates = (termCandidates.get(item.term) || []).filter((c) => !c.isExact);
    for (const cand of derivedCandidates) {
      if (!isSpanClaimed(cand.start, cand.end)) {
        claimedSpans.push({ start: cand.start, end: cand.end, term: item.term, usedAs: cand.usedAs });
        assigned.set(item.term, cand);
        break;
      }
    }
  }

  // 5. Detect and record span collisions across candidates
  const spanToTerms = new Map<string, { start: number; end: number; text: string; terms: Set<string> }>();
  for (const [term, cands] of termCandidates.entries()) {
    for (const c of cands) {
      const key = `${c.start}:${c.end}`;
      if (!spanToTerms.has(key)) {
        spanToTerms.set(key, { start: c.start, end: c.end, text: c.usedAs, terms: new Set() });
      }
      spanToTerms.get(key)!.terms.add(term);
    }
  }

  for (const [, info] of spanToTerms.entries()) {
    if (info.terms.size > 1) {
      const winner = claimedSpans.find((s) => overlaps(info.start, info.end, s.start, s.end));
      if (winner) {
        collisions.push({
          span: { start: info.start, end: info.end, text: info.text },
          competingTerms: Array.from(info.terms),
          winnerTerm: winner.term,
        });
      }
    }
  }

  // 6. Build used and missing arrays
  const used: Array<{ term: string; usedAs: string; start?: number; end?: number }> = [];
  const missing: string[] = [];

  for (const item of uniqueTerms) {
    const match = assigned.get(item.term);
    if (match) {
      used.push({
        term: item.term,
        usedAs: match.usedAs,
        start: match.start,
        end: match.end,
      });
    } else {
      missing.push(item.term);
    }
  }

  const totalTerms = uniqueTerms.length;
  const coveragePercent = totalTerms > 0 ? (used.length / totalTerms) * 100 : 100;

  return {
    totalTerms,
    matchedTerms: used.length,
    used,
    missing,
    coveragePercent,
    collisions,
  };
}

