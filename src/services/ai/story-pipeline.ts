import { z } from "zod";
import { AI_CONFIG } from "./ai-config";
import {
  cleanAndParseJson,
  AIInvalidResponseError,
  AIValidationError,
  AIParseError,
  AICancelledError,
} from "./ai-core";
import { OllamaAiProvider } from "./ollama-ai-provider";
import {
  type StoryCefr,
  type StoryLength,
  type StoryTopic,
  type AIStoryResponse,
} from "@/lib/validation/story";
import { normalizeStoryPlainText } from "@/lib/story/story-content";
import { calculateDesiredPassageLength } from "@/lib/story/story-options";
import {
  buildStoryPromptForStructuredJson,
  buildLocalCompactStoryPromptForStructuredJson,
} from "@/lib/story/story-prompt";
import { splitStoryIntoNarrationChunks } from "@/lib/story/story-narration";
import { getNarrationTtsService } from "@/lib/tts/tts-runtime";
import type { CloudTtsVoiceId } from "@/lib/tts/voice-catalog";
import { storyService } from "@/services/vocabulary/story-service";

export type StoryPipelineStage =
  | "queued"
  | "generating_story"
  | "validating_vocabulary"
  | "repairing_story"
  | "generating_translations"
  | "generating_narration"
  | "saving"
  | "completed";

export type StoryPipelineOptions = {
  deckId: string;
  targetWords: string[];
  cefr?: StoryCefr;
  length?: StoryLength;
  topic?: StoryTopic;
  narrationVoiceId?: CloudTtsVoiceId;
  useCompactPrompt?: boolean;
  signal?: AbortSignal;
  onStageChange?: (stage: StoryPipelineStage, progress: number) => Promise<void>;
  ollamaProvider?: OllamaAiProvider;
};

const MAX_COVERAGE_REPAIR_PASSES = 4;

type CoverageSnapshot = {
  pass: number;
  matchedTerms: number;
  totalTerms: number;
  coveragePercent: number;
  missingTerms: string[];
  termsAdded?: string[];
  termsLost?: string[];
  accepted?: boolean;
  plateauReason?: string;
};

function toCoverageSnapshot(pass: number, coverage: ReturnType<typeof analyzeVocabularyCoverage>): CoverageSnapshot {
  return {
    pass,
    matchedTerms: coverage.matchedTerms,
    totalTerms: coverage.totalTerms,
    coveragePercent: coverage.coveragePercent,
    missingTerms: coverage.missing,
  };
}

const storyBaseSchema = z.object({
  title: z.string().trim().min(1, "Title must not be empty"),
  content: z.string().trim().min(10, "Content must not be empty"),
});

const repairOutputSchema = z.union([
  z.object({
    title: z.string().optional(),
    continuation: z.string().trim().min(5),
  }),
  z.object({
    title: z.string().optional(),
    content: z.string().trim().min(5),
  }),
  z.object({
    title: z.string().optional(),
    paragraph: z.string().trim().min(5),
  }),
  z.object({
    title: z.string().optional(),
    paragraphs: z.union([z.string(), z.array(z.string())]),
  }),
]);

const contextualTranslationBatchSchema = z.union([
  z.object({
    translations: z.array(
      z.object({
        term: z.string().trim().min(1),
        usedAs: z.string().trim().min(1),
        meaningVi: z.string().trim().min(1),
      })
    ),
  }).transform((val) => val.translations),
  z.array(
    z.object({
      term: z.string().trim().min(1),
      usedAs: z.string().trim().min(1),
      meaningVi: z.string().trim().min(1),
    })
  ),
]);

function extractRepairedText(raw: z.infer<typeof repairOutputSchema>): { title?: string; text: string } {
  const title = "title" in raw && typeof raw.title === "string" ? raw.title : undefined;
  if ("continuation" in raw) return { title, text: raw.continuation };
  if ("content" in raw) return { title, text: raw.content };
  if ("paragraph" in raw) return { title, text: raw.paragraph };
  if ("paragraphs" in raw) {
    const text = Array.isArray(raw.paragraphs) ? raw.paragraphs.join("\n\n") : raw.paragraphs;
    return { title, text };
  }
  return { title, text: "" };
}

function mergeRepairedContent({
  existingContent,
  repairedText,
}: {
  existingContent: string;
  repairedText: string;
}): string {
  const existingParagraphs = existingContent
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  // If the model returned the entire story rewritten (contains a substantial part of the original)
  if (
    existingParagraphs.length > 0 &&
    repairedText.length > existingContent.length * 0.7 &&
    (repairedText.includes(existingParagraphs[0].slice(0, 50)) ||
      repairedText.includes(existingParagraphs[Math.min(1, existingParagraphs.length - 1)].slice(0, 50)))
  ) {
    return normalizeStoryPlainText(repairedText);
  }

  // Otherwise, treat as targeted continuation paragraph(s)
  const newParagraphs = repairedText
    .split(/\n\s*\n/)
    .map((p) => normalizeStoryPlainText(p).trim())
    .filter(Boolean);

  if (newParagraphs.length === 0) {
    return existingContent;
  }

  if (existingParagraphs.length >= 2) {
    const merged = [
      ...existingParagraphs.slice(0, -1),
      ...newParagraphs,
      existingParagraphs[existingParagraphs.length - 1],
    ];
    return merged.join("\n\n");
  }

  return [...existingParagraphs, ...newParagraphs].join("\n\n");
}

export function normalizeRawTranslationBatch(
  rawParsed: unknown,
  requestedTerms: Array<{ term: string; usedAs: string }>
): Array<{ term: string; usedAs: string; meaningVi: string }> | null {
  if (!rawParsed || typeof rawParsed !== "object") return null;

  let rawList: unknown[] = [];
  const obj = rawParsed as Record<string, unknown>;

  if (Array.isArray(obj.translations)) {
    rawList = obj.translations;
  } else if (Array.isArray(obj.data)) {
    rawList = obj.data;
  } else if (Array.isArray(rawParsed)) {
    rawList = rawParsed;
  } else if (obj.translations && typeof obj.translations === "object") {
    rawList = Object.entries(obj.translations as Record<string, unknown>).map(([term, val]) => ({
      term,
      meaningVi:
        typeof val === "string"
          ? val
          : (val as Record<string, unknown>)?.meaningVi ||
            (val as Record<string, unknown>)?.meaning ||
            String(val),
    }));
  } else {
    const entries = Object.entries(obj);
    if (
      entries.length > 0 &&
      entries.every(([, v]) => typeof v === "string" || (typeof v === "object" && v !== null))
    ) {
      rawList = entries.map(([term, val]) => ({
        term,
        meaningVi:
          typeof val === "string"
            ? val
            : (val as Record<string, unknown>)?.meaningVi ||
              (val as Record<string, unknown>)?.meaning ||
              String(val),
      }));
    } else {
      return null;
    }
  }

  if (rawList.length === 0) return null;

  const norm = (s: string) => s.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const requestedByTerm = new Map<string, { term: string; usedAs: string }>();
  const requestedByUsedAs = new Map<string, { term: string; usedAs: string }>();

  for (const item of requestedTerms) {
    requestedByTerm.set(norm(item.term), item);
    requestedByUsedAs.set(norm(item.usedAs), item);
  }

  const assigned = new Map<string, { term: string; usedAs: string; meaningVi: string }>();

  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;

    const candidateKey =
      typeof r.term === "string" && r.term.trim()
        ? r.term
        : typeof r.word === "string" && r.word.trim()
        ? r.word
        : typeof r.english === "string" && r.english.trim()
        ? r.english
        : typeof r.englishWord === "string" && r.englishWord.trim()
        ? r.englishWord
        : typeof r.usedAs === "string" && r.usedAs.trim()
        ? r.usedAs
        : Object.keys(r).find((k) => requestedByTerm.has(norm(k)) || requestedByUsedAs.has(norm(k))) ||
          "";

    const candidateMeaning =
      typeof r.meaningVi === "string" && r.meaningVi.trim()
        ? r.meaningVi.trim()
        : typeof r.meaning === "string" && r.meaning.trim()
        ? r.meaning.trim()
        : typeof r.translation === "string" && r.translation.trim()
        ? r.translation.trim()
        : typeof r.vietnamese === "string" && r.vietnamese.trim()
        ? r.vietnamese.trim()
        : typeof r.meaning_vi === "string" && r.meaning_vi.trim()
        ? r.meaning_vi.trim()
        : "";

    if (!candidateKey || !candidateMeaning) continue;

    const matchedReq =
      requestedByTerm.get(norm(candidateKey)) || requestedByUsedAs.get(norm(candidateKey));
    if (matchedReq && !assigned.has(norm(matchedReq.term))) {
      assigned.set(norm(matchedReq.term), {
        term: matchedReq.term,
        usedAs: matchedReq.usedAs,
        meaningVi: candidateMeaning,
      });
    }
  }

  // Index-based fallback ONLY when count matches, order is unambiguous, and unassigned terms remain
  if (assigned.size < requestedTerms.length && rawList.length === requestedTerms.length) {
    let canIndexMap = true;
    const indexResults: Array<{ term: string; usedAs: string; meaningVi: string }> = [];

    for (let i = 0; i < requestedTerms.length; i++) {
      const raw = rawList[i];
      if (!raw || typeof raw !== "object") {
        canIndexMap = false;
        break;
      }
      const r = raw as Record<string, unknown>;
      const candidateMeaning =
        typeof r.meaningVi === "string" && r.meaningVi.trim()
          ? r.meaningVi.trim()
          : typeof r.meaning === "string" && r.meaning.trim()
          ? r.meaning.trim()
          : typeof r.translation === "string" && r.translation.trim()
          ? r.translation.trim()
          : typeof r.vietnamese === "string" && r.vietnamese.trim()
          ? r.vietnamese.trim()
          : typeof r.meaning_vi === "string" && r.meaning_vi.trim()
          ? r.meaning_vi.trim()
          : "";

      if (!candidateMeaning) {
        canIndexMap = false;
        break;
      }

      indexResults.push({
        term: requestedTerms[i].term,
        usedAs: requestedTerms[i].usedAs,
        meaningVi: candidateMeaning,
      });
    }

    if (canIndexMap && indexResults.length === requestedTerms.length) {
      return indexResults;
    }
  }

  if (assigned.size === requestedTerms.length) {
    return requestedTerms.map((req) => assigned.get(norm(req.term))!);
  }

  return null;
}

export function getRepairWordBudget(
  missingCount: number,
  remainingGlobalBudget?: number
): { min: number; max: number; label: string } {
  let base: { min: number; max: number; label: string };
  if (missingCount <= 3) {
    base = { min: 80, max: 120, label: "approx. 80–120 words" };
  } else if (missingCount <= 8) {
    base = { min: 140, max: 200, label: "approx. 140–200 words" };
  } else if (missingCount <= 15) {
    base = { min: 220, max: 320, label: "approx. 220–320 words" };
  } else {
    base = { min: 300, max: 420, label: "approx. 300–420 words" };
  }

  if (typeof remainingGlobalBudget === "number") {
    if (remainingGlobalBudget <= 0) {
      return { min: 40, max: 80, label: "approx. 40–80 words (strictly minimal conclusion to prevent story bloat)" };
    }
    const cappedMax = Math.max(60, Math.min(base.max, remainingGlobalBudget));
    const cappedMin = Math.max(40, Math.min(base.min, Math.round(cappedMax * 0.7)));
    return {
      min: cappedMin,
      max: cappedMax,
      label: `approx. ${cappedMin}–${cappedMax} words (strictly bounded by remaining story budget)`,
    };
  }

  return base;
}

export function extractSurroundingSentence(
  content: string,
  start?: number,
  end?: number,
  fallbackTerm?: string
): string {
  if (typeof start === "number" && typeof end === "number" && start >= 0 && end <= content.length) {
    const beforeText = content.slice(0, start);
    const lastBoundary = Math.max(
      beforeText.lastIndexOf("."),
      beforeText.lastIndexOf("!"),
      beforeText.lastIndexOf("?"),
      beforeText.lastIndexOf("\n")
    );
    const sentenceStart = lastBoundary >= 0 ? lastBoundary + 1 : 0;

    const afterText = content.slice(end);
    const nextDot = afterText.indexOf(".");
    const nextExcl = afterText.indexOf("!");
    const nextQues = afterText.indexOf("?");
    const nextNl = afterText.indexOf("\n");

    const validIndices = [nextDot, nextExcl, nextQues, nextNl].filter((idx) => idx >= 0);
    const nextBoundary = validIndices.length > 0 ? Math.min(...validIndices) : afterText.length;
    const sentenceEnd = end + nextBoundary + (validIndices.length > 0 && afterText[nextBoundary] !== "\n" ? 1 : 0);

    const sentence = content.slice(sentenceStart, sentenceEnd).replace(/\s+/g, " ").trim();
    if (sentence.length >= 10 && sentence.length <= 350) {
      return sentence;
    }
  }

  if (fallbackTerm) {
    const escaped = fallbackTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`([^.!?\\n]*\\b${escaped}\\b[^.!?\\n]*[.!?]?)`, "iu");
    const match = content.match(regex);
    if (match && match[1]) {
      const s = match[1].replace(/\s+/g, " ").trim();
      if (s.length >= 10) return s;
    }
  }

  return content.slice(0, 200).replace(/\s+/g, " ").trim();
}

export type RepetitionDiagnostic = {
  repeatedTerms: Array<{ term: string; count: number }>;
  repeatedFrames: {
    theAbilityTo: number;
    theImportanceOf: number;
    aKeyFactor: number;
    thisIsWhy: number;
  };
  paragraphOpeners: Record<string, number>;
};

export function analyzeRepetition(content: string, targetTerms: string[]): RepetitionDiagnostic {
  const normContent = content.toLocaleLowerCase();
  const repeatedTerms: Array<{ term: string; count: number }> = [];

  for (const term of targetTerms) {
    const escaped = term.toLocaleLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = normContent.match(new RegExp(`\\b${escaped}\\b`, "gu"));
    const count = matches ? matches.length : 0;
    if (count > 2) {
      repeatedTerms.push({ term, count });
    }
  }

  const theAbilityTo = (normContent.match(/\bthe ability to\b/gu) || []).length;
  const theImportanceOf = (normContent.match(/\bthe importance of\b/gu) || []).length;
  const aKeyFactor = (normContent.match(/\ba key factor\b/gu) || []).length;
  const thisIsWhy = (normContent.match(/\bthis is why\b/gu) || []).length;

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const paragraphOpeners: Record<string, number> = {};
  for (const p of paragraphs) {
    const firstWords = p.split(/\s+/).slice(0, 2).join(" ");
    paragraphOpeners[firstWords] = (paragraphOpeners[firstWords] || 0) + 1;
  }

  return {
    repeatedTerms,
    repeatedFrames: {
      theAbilityTo,
      theImportanceOf,
      aKeyFactor,
      thisIsWhy,
    },
    paragraphOpeners,
  };
}

import {
  findWordInContent,
  analyzeVocabularyCoverage,
  type CoverageVocabularyTerm,
  type CoverageTermInput,
  type SpanCollisionDiagnostic,
} from "@/lib/story/story-vocabulary";

export {
  findWordInContent,
  analyzeVocabularyCoverage,
  type CoverageVocabularyTerm,
  type CoverageTermInput,
  type SpanCollisionDiagnostic,
};



export type StoryPipelineTimings = {
  initialGenerationMs: number;
  coverageValidationMs: number;
  repairPassesMs: number[];
  repairTotalMs: number;
  translationBatchMs: number[];
  translationRetryCount: number;
  translationTotalMs: number;
  persistenceMs: number;
  narrationMs: number;
  totalPipelineMs: number;
};

export type StoryPipelineResult = {
  story: Awaited<ReturnType<typeof storyService.persistGeneratedStory>>;
  usage: CoverageVocabularyTerm[];
  coveragePercent: number;
  missingTerms: string[];
  repairPasses: number;
  coverageHistory: ReturnType<typeof toCoverageSnapshot>[];
  timings: StoryPipelineTimings;
  quality: {
    repetition: RepetitionDiagnostic;
    collisions: SpanCollisionDiagnostic[];
  };
};

export async function executeStoryPipeline(options: StoryPipelineOptions): Promise<StoryPipelineResult> {
  const totalStart = performance.now();
  const timings: StoryPipelineTimings = {
    initialGenerationMs: 0,
    coverageValidationMs: 0,
    repairPassesMs: [],
    repairTotalMs: 0,
    translationBatchMs: [],
    translationRetryCount: 0,
    translationTotalMs: 0,
    persistenceMs: 0,
    narrationMs: 0,
    totalPipelineMs: 0,
  };

  const {
    deckId,
    targetWords,
    cefr = "B1",
    length = "medium",
    topic = "Daily Life",
    narrationVoiceId,
    useCompactPrompt = true,
    signal,
    onStageChange,
  } = options;

  const ollama =
    options.ollamaProvider ||
    new OllamaAiProvider({
      baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
      model: process.env.LOCAL_AI_MODEL || process.env.OLLAMA_MODEL || AI_CONFIG.defaultModel,
    });

  if (signal?.aborted) throw new AICancelledError();

  // 0. Canonicalize against deck
  const selectedVocabulary = await storyService.getSelectedDeckVocabulary(deckId, targetWords);
  const requestedTerms = selectedVocabulary.map((item) => item.term);
  if (selectedVocabulary.length === 0) {
    throw new Error("Không có từ vựng nào hợp lệ để tạo truyện.");
  }

  // STEP 1: Generate Story (Title + Content)
  await onStageChange?.("generating_story", 10);
  if (signal?.aborted) throw new AICancelledError();

  const genStart = performance.now();
  const storyPrompt = useCompactPrompt
    ? buildLocalCompactStoryPromptForStructuredJson({
        targetWords: requestedTerms,
        cefr,
        length,
        topic,
      })
    : buildStoryPromptForStructuredJson({
        targetWords: requestedTerms,
        cefr,
        length,
        topic,
      });

  const baseStory = await callStructuredWithRetry({
    ollama,
    systemPrompt:
      "You are WordNest Reading Engine, an expert English-language writer, CEFR curriculum designer, vocabulary-in-context specialist, and professional English editor. You must output valid JSON only.",
    prompt: storyPrompt,
    schema: storyBaseSchema,
    temperature: AI_CONFIG.story.temperature,
    topP: AI_CONFIG.story.topP,
    numCtx: AI_CONFIG.defaultContextSize,
    think: AI_CONFIG.story.think,
    timeoutMs: AI_CONFIG.story.timeoutMs,
    signal,
  });
  timings.initialGenerationMs = Math.round(performance.now() - genStart);

  let currentTitle = baseStory.title;
  let currentContent = normalizeStoryPlainText(baseStory.content);

  // STEP 2: Validate vocabulary coverage with deterministic code
  const valStart = performance.now();
  await onStageChange?.("validating_vocabulary", 45);
  if (signal?.aborted) throw new AICancelledError();

  let coverage = analyzeVocabularyCoverage(currentContent, selectedVocabulary);
  const coverageHistory = [toCoverageSnapshot(0, coverage)];
  let repairPasses = 0;
  timings.coverageValidationMs = Math.round(performance.now() - valStart);

  // STEP 3: Targeted Continuation Repair with Global Soft Ceiling & Plateau Exit
  const desiredWords = calculateDesiredPassageLength(length, requestedTerms.length);
  const softMaxWords = Math.round(desiredWords * 1.20);
  const emergencyCeilingWords = Math.round(desiredWords * 1.25);
  const maxPasses = requestedTerms.length > 40 ? 5 : MAX_COVERAGE_REPAIR_PASSES;

  let consecutiveZeroGains = 0;
  for (let repairPass = 1; repairPass <= maxPasses && coverage.missing.length > 0; repairPass++) {
    const currentStoryWordCount = currentContent.split(/\s+/).filter(Boolean).length;
    const remainingWordBudget = softMaxWords - currentStoryWordCount;

    // Target achieved: coverage >= 95% and length at or above desired words -> stop cleanly!
    if (coverage.coveragePercent >= 95 && currentStoryWordCount >= desiredWords) {
      console.log(
        `[StoryPipeline] Target achieved at repair pass ${repairPass}: coverage reached ${coverage.coveragePercent.toFixed(1)}% (>= 95%) and word count (${currentStoryWordCount}) reached desired length (${desiredWords} words). Stopping repair to prevent story bloat.`
      );
      break;
    }

    // Global Soft Ceiling Guard:
    // If coverage >= 95% and current length has reached softMaxWords, stop cleanly!
    if (remainingWordBudget <= 0 && coverage.coveragePercent >= 95) {
      console.log(
        `[StoryPipeline] Early exit at repair pass ${repairPass}: coverage reached ${coverage.coveragePercent.toFixed(1)}% (>= 95%) and word count (${currentStoryWordCount}) reached soft ceiling (${softMaxWords} words).`
      );
      break;
    }

    // Absolute Emergency Ceiling Guard: never allow story to balloon past emergency ceiling
    if (currentStoryWordCount >= emergencyCeilingWords) {
      console.log(
        `[StoryPipeline] Emergency ceiling exit at repair pass ${repairPass}: word count (${currentStoryWordCount}) reached emergency ceiling (${emergencyCeilingWords} words).`
      );
      break;
    }

    repairPasses++;
    const passStart = performance.now();
    await onStageChange?.("repairing_story", 50 + Math.min(repairPass * 5, 20));
    if (signal?.aborted) throw new AICancelledError();

    // Dynamically scale batch size of missing terms based on queue depth
    const sliceCount =
      coverage.missing.length >= 20 ? 15 : coverage.missing.length >= 10 ? 12 : coverage.missing.length;
    const termsForThisPass = coverage.missing.slice(0, sliceCount);
    const existingParagraphs = currentContent
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    const recentContext = existingParagraphs.slice(-2).join("\n\n");
    const budget = getRepairWordBudget(termsForThisPass.length, remainingWordBudget);

    const repairPrompt = `You are WordNest Reading Engine continuing and expanding an English reading passage.

Story Title: "${currentTitle}"

Preceding Story Excerpt:
"${recentContext}"

Target Terms to seamlessly integrate:
${JSON.stringify(termsForThisPass)}

Length Guidance:
- Write ${budget.label}.
- Keep length controlled and focused on natural narrative progression. Never bloat the story with redundant filler.

Narrative & Style Requirements:
1. Seamlessly continue the story from the excerpt above while integrating the target terms.
2. Advance the narrative (character actions, dialogue, obstacles, turning point, or resolution). Do NOT produce an expository or informational essay.
3. Maintain CEFR ${cefr} level, register, and tone.
4. You MAY grammatically inflect base forms (e.g. apply -> applied, recruit -> recruiting, bring together -> brought together).
5. Authentic collocations: never produce forced or ungrammatical sentences just to fit a word.
6. Anti-repetition: do NOT start consecutive sentences with "the ability to...", "The importance of...", or repetitive phrasing. Vary sentence openings.
7. Return clean plain text without Markdown formatting (**bold**, *italic*).

Respond with JSON only matching this schema:
{
  "continuation": "Paragraph 1...\\n\\nParagraph 2..."
}`;

    try {
      const repaired = await callStructuredWithRetry({
        ollama,
        systemPrompt:
          "You are WordNest Reading Engine writing a natural continuation paragraph to integrate vocabulary. Output valid JSON only.",
        prompt: repairPrompt,
        schema: repairOutputSchema,
        temperature: AI_CONFIG.repair.temperature,
        topP: AI_CONFIG.repair.topP,
        numCtx: AI_CONFIG.defaultContextSize,
        think: AI_CONFIG.repair.think,
        timeoutMs: 60_000,
        signal,
      });

      const { title: newTitle, text: rawText } = extractRepairedText(repaired);
      const candidateContent = mergeRepairedContent({
        existingContent: currentContent,
        repairedText: rawText,
      });
      const newCoverage = analyzeVocabularyCoverage(candidateContent, selectedVocabulary);

      const termsAdded = newCoverage.used
        .filter((u) => !coverage.used.some((prev) => prev.term === u.term))
        .map((u) => u.term);
      const termsLost = coverage.used
        .filter((prev) => !newCoverage.used.some((c) => c.term === prev.term))
        .map((prev) => prev.term);
      const netGain = termsAdded.length - termsLost.length;

      if (netGain > 0) {
        currentTitle = newTitle || currentTitle;
        currentContent = candidateContent;
        coverage = newCoverage;
        consecutiveZeroGains = 0;
        coverageHistory.push({
          ...toCoverageSnapshot(repairPass, newCoverage),
          termsAdded,
          termsLost,
          accepted: true,
        });
      } else {
        consecutiveZeroGains++;
        coverageHistory.push({
          ...toCoverageSnapshot(repairPass, newCoverage),
          termsAdded,
          termsLost,
          accepted: false,
          plateauReason: "Zero net gain in newly matched vocabulary",
        });
      }
    } catch (repairErr) {
      console.warn(`[StoryPipeline] Targeted continuation repair pass ${repairPass} skipped due to error:`, repairErr);
      consecutiveZeroGains++;
    } finally {
      timings.repairPassesMs.push(Math.round(performance.now() - passStart));
    }

    // Plateau Early Exit
    if (coverage.missing.length === 0) {
      break;
    }
    if (consecutiveZeroGains >= 2) {
      console.log(`[StoryPipeline] Early exit at repair pass ${repairPass}: Plateau reached (2 consecutive passes with 0 net gain).`);
      break;
    }
  }

  timings.repairTotalMs = timings.repairPassesMs.reduce((a, b) => a + b, 0);

  // STEP 4: Generate contextual translations with adaptive fallback
  await onStageChange?.("generating_translations", 70);
  if (signal?.aborted) throw new AICancelledError();

  const allTranslations: Array<{ term: string; usedAs: string; meaningVi: string }> = [];
  const termsToTranslate = coverage.used;
  const initialBatchSize = AI_CONFIG.translationBatch.batchSize;

  for (let i = 0; i < termsToTranslate.length; i += initialBatchSize) {
    if (signal?.aborted) throw new AICancelledError();

    const batch = termsToTranslate.slice(i, i + initialBatchSize);
    const translatedBatch = await translateTermsBatchAdaptive({
      ollama,
      terms: batch,
      storyContent: currentContent,
      signal,
      onTiming: (ms) => timings.translationBatchMs.push(ms),
      onRetry: () => {
        timings.translationRetryCount++;
      },
    });
    allTranslations.push(...translatedBatch);
  }
  timings.translationTotalMs = timings.translationBatchMs.reduce((a, b) => a + b, 0);

  // STEP 5: Narration
  if (narrationVoiceId) {
    const narrStart = performance.now();
    await onStageChange?.("generating_narration", 88);
    if (signal?.aborted) throw new AICancelledError();
    await getNarrationTtsService().synthesizeNarration({
      voiceId: narrationVoiceId,
      chunks: splitStoryIntoNarrationChunks(currentContent),
    });
    timings.narrationMs = Math.round(performance.now() - narrStart);
  }

  // STEP 6: Merge Final Story & Save to Database
  const persistStart = performance.now();
  await onStageChange?.("saving", 95);
  if (signal?.aborted) throw new AICancelledError();

  const finalGenerated: AIStoryResponse = {
    title: currentTitle,
    content: currentContent,
    wordsUsed: coverage.used.map((u) => u.term),
    usage: coverage.used,
    contextualTranslations: allTranslations,
  };

  const story = await storyService.persistGeneratedStory({
    deckId,
    requestedTerms,
    cefr,
    length,
    topic,
    generated: finalGenerated,
    narrationVoiceId,
  });
  timings.persistenceMs = Math.round(performance.now() - persistStart);

  await onStageChange?.("completed", 100);

  timings.totalPipelineMs = Math.round(performance.now() - totalStart);

  const repetition = analyzeRepetition(currentContent, requestedTerms);

  return {
    story,
    usage: coverage.used,
    coveragePercent: coverage.coveragePercent,
    missingTerms: coverage.missing,
    repairPasses,
    coverageHistory,
    timings,
    quality: {
      repetition,
      collisions: coverage.collisions || [],
    },
  };
}

async function callStructuredWithRetry<T>({
  ollama,
  systemPrompt,
  prompt,
  schema,
  temperature,
  topP,
  numCtx,
  numPredict,
  think,
  timeoutMs,
  signal,
}: {
  ollama: OllamaAiProvider;
  systemPrompt: string;
  prompt: string;
  schema: z.ZodSchema<T>;
  temperature?: number;
  topP?: number;
  numCtx?: number;
  numPredict?: number;
  think?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<T> {
  let attempts = 0;
  const maxRetries = AI_CONFIG.job.maxRetries;

  while (true) {
    if (signal?.aborted) throw new AICancelledError();

    try {
      const rawText = await ollama.generateJson({
        systemPrompt,
        prompt,
        temperature,
        topP,
        numCtx,
        numPredict,
        think,
        timeoutMs,
        signal,
      });

      const parsed = cleanAndParseJson<unknown>(rawText);
      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        throw new AIValidationError("JSON schema validation failed", validated.error.issues);
      }
      return validated.data;
    } catch (error) {
      if (error instanceof AICancelledError) throw error;

      if (
        (error instanceof AIParseError || error instanceof AIValidationError) &&
        attempts < maxRetries
      ) {
        attempts++;
        console.warn(`[StoryPipeline] Structured generation retry ${attempts}/${maxRetries}`);
        continue;
      }
      throw error instanceof AIValidationError || error instanceof AIParseError
        ? new AIInvalidResponseError(undefined, error)
        : error;
    }
  }
}

async function translateTermsBatchAdaptive({
  ollama,
  terms,
  storyContent,
  signal,
  onTiming,
  onRetry,
}: {
  ollama: OllamaAiProvider;
  terms: Array<{ term: string; usedAs: string; start?: number; end?: number }>;
  storyContent: string;
  signal?: AbortSignal;
  onTiming?: (durationMs: number) => void;
  onRetry?: () => void;
}): Promise<Array<{ term: string; usedAs: string; meaningVi: string }>> {
  if (terms.length === 0) return [];

  const batchStart = performance.now();

  const itemsWithSentence = terms.map((t) => ({
    term: t.term,
    usedAs: t.usedAs,
    contextSentence: extractSurroundingSentence(storyContent, t.start, t.end, t.usedAs),
  }));

  const translationPrompt = `You are an expert bilingual English-Vietnamese translator.
Translate each English vocabulary term into natural Vietnamese based STRICTLY on its exact meaning in the context sentence provided.

Translation Rules:
1. Translate the specific contextual sense used in that sentence (e.g., if "call in" appears in "Lena was called in for a meeting", translate as "được mời đến" or "triệu tập đến", NOT "gọi điện nhờ").
2. Provide a concise, natural Vietnamese meaning (1–4 words). Do not include English words or lengthy grammatical explanations.
3. Preserve the exact canonical term and usedAs provided.

Items to translate:
${JSON.stringify(itemsWithSentence, null, 2)}

Respond with JSON only matching this schema:
{
  "translations": [
    { "term": "...", "usedAs": "...", "meaningVi": "nghĩa tiếng Việt tự nhiên đúng ngữ cảnh" }
  ]
}`;

  try {
    const rawText = await ollama.generateJson({
      systemPrompt:
        "You are an expert English-Vietnamese translator. Provide accurate, natural contextual Vietnamese translations in valid JSON.",
      prompt: translationPrompt,
      temperature: AI_CONFIG.translationBatch.temperature,
      topP: AI_CONFIG.translationBatch.topP,
      numCtx: AI_CONFIG.defaultContextSize,
      numPredict: AI_CONFIG.translationBatch.numPredict,
      think: AI_CONFIG.translationBatch.think,
      timeoutMs: AI_CONFIG.translationBatch.timeoutMs,
      signal,
    });

    const parsed = cleanAndParseJson<unknown>(rawText);

    // 1. Check strict schema match
    const strictVal = contextualTranslationBatchSchema.safeParse(parsed);
    if (strictVal.success && strictVal.data.length === terms.length) {
      onTiming?.(Math.round(performance.now() - batchStart));
      return strictVal.data;
    }

    // 2. Controlled normalization layer with exact mapping and index fallback guardrails
    const normalized = normalizeRawTranslationBatch(parsed, terms);
    if (normalized && normalized.length === terms.length) {
      onTiming?.(Math.round(performance.now() - batchStart));
      return normalized;
    }

    throw new Error("Translation batch normalization did not resolve all requested terms");
  } catch (batchErr) {
    onRetry?.();
    if (terms.length > 8) {
      console.warn(`[StoryPipeline] Translation batch (${terms.length} terms) failed/incomplete. Retrying in sub-batches...`);
      const mid = Math.ceil(terms.length / 2);
      const firstHalf = await translateTermsBatchAdaptive({
        ollama,
        terms: terms.slice(0, mid),
        storyContent,
        signal,
        onTiming,
        onRetry,
      });
      const secondHalf = await translateTermsBatchAdaptive({
        ollama,
        terms: terms.slice(mid),
        storyContent,
        signal,
        onTiming,
        onRetry,
      });
      return [...firstHalf, ...secondHalf];
    }

    if (terms.length > 4) {
      console.warn(`[StoryPipeline] Translation batch (${terms.length} terms) failed/incomplete. Retrying in sub-batches of ~4...`);
      const mid = Math.ceil(terms.length / 2);
      const firstHalf = await translateTermsBatchAdaptive({
        ollama,
        terms: terms.slice(0, mid),
        storyContent,
        signal,
        onTiming,
        onRetry,
      });
      const secondHalf = await translateTermsBatchAdaptive({
        ollama,
        terms: terms.slice(mid),
        storyContent,
        signal,
        onTiming,
        onRetry,
      });
      return [...firstHalf, ...secondHalf];
    }

    console.warn(`[StoryPipeline] Translation fallback recovery for ${terms.length} terms:`, batchErr);
    // Term by term fallback recovery
    const recovered: Array<{ term: string; usedAs: string; meaningVi: string }> = [];
    for (const item of terms) {
      const singleStart = performance.now();
      const sentence = extractSurroundingSentence(storyContent, item.start, item.end, item.usedAs);
      try {
        const singlePrompt = `Translate "${item.usedAs}" (word: "${item.term}") into natural Vietnamese as used in this sentence: "${sentence}".
Rule: Return only the concise Vietnamese contextual meaning of the term as used in that specific sentence.
JSON only: { "translations": [{ "term": "${item.term}", "usedAs": "${item.usedAs}", "meaningVi": "..." }] }`;
        const rawSingle = await ollama.generateJson({
          systemPrompt: "You are an expert English-Vietnamese translator. Output valid JSON only.",
          prompt: singlePrompt,
          temperature: 0.1,
          numCtx: AI_CONFIG.defaultContextSize,
          numPredict: 256,
          timeoutMs: 30_000,
          signal,
        });
        const parsedSingle = cleanAndParseJson<unknown>(rawSingle);
        const singleNormalized = normalizeRawTranslationBatch(parsedSingle, [item]);
        if (singleNormalized && singleNormalized.length === 1) {
          recovered.push(singleNormalized[0]);
        } else {
          recovered.push({
            term: item.term,
            usedAs: item.usedAs,
            meaningVi: item.term,
          });
        }
      } catch {
        onRetry?.();
        recovered.push({
          term: item.term,
          usedAs: item.usedAs,
          meaningVi: item.term,
        });
      } finally {
        onTiming?.(Math.round(performance.now() - singleStart));
      }
    }
    return recovered;
  }
}
