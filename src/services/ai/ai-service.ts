import {
  aiBatchFlashcardResponseSchema,
  type GeneratedFlashcardItem,
} from "@/lib/validation/flashcard";
import {
  aiStoryResponseSchema,
  contextualTranslationResponseSchema,
  type AIStoryResponse,
  type ContextualTranslationResponse,
  type StoryCefr,
  type StoryLength,
  type StoryTopic,
} from "@/lib/validation/story";
import { buildStoryPrompt } from "@/lib/story/story-prompt";
import { normalizeTerm } from "@/services/vocabulary/parser";
import { type ZodSchema } from "zod";
import {
  cleanAndParseJson,
  AIError,
  AIInvalidResponseError,
  AIParseError,
  AIValidationError,
} from "./ai-core";
import { OllamaAiProvider } from "./ollama-ai-provider";

const DEFAULT_OLLAMA_TIMEOUT_MS = 45_000;

export type FlashcardGenerationInput =
  | string
  | { term: string; meaningVi?: string; exampleEn?: string };

export interface AIService {
  generateFlashcards(terms: FlashcardGenerationInput[]): Promise<GeneratedFlashcardItem[]>;
  generateStory(params: {
    targetWords: string[];
    cefr?: StoryCefr;
    length?: StoryLength;
    topic?: StoryTopic;
  }): Promise<AIStoryResponse>;
  translateInContext(params: {
    selectedText: string;
    canonicalTerm?: string;
    surroundingSentence: string;
    context?: string;
  }): Promise<ContextualTranslationResponse>;
}

import { AI_CONFIG } from "./ai-config";

type StructuredGenerationOptions<T> = {
  systemPrompt?: string;
  prompt: string;
  schema: ZodSchema<T>;
  temperature?: number;
  topP?: number;
  numCtx?: number;
  think?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
};

/** Text generation stays on the local Ollama daemon; no hosted AI fallback exists. */
export class OllamaAIService implements AIService {
  private readonly ollama: OllamaAiProvider;
  private readonly model: string;

  constructor(options?: { baseUrl?: string; model?: string; fetcher?: typeof fetch }) {
    this.model =
      options?.model?.trim() ||
      process.env.LOCAL_AI_MODEL ||
      process.env.OLLAMA_MODEL ||
      AI_CONFIG.defaultModel;
    this.ollama = new OllamaAiProvider({
      baseUrl: options?.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
      model: this.model,
      fetcher: options?.fetcher,
    });
  }

  async generateFlashcards(terms: FlashcardGenerationInput[]): Promise<GeneratedFlashcardItem[]> {
    if (terms.length === 0) return [];

    const batchSize = AI_CONFIG.flashcards.batchSize || 10;
    if (terms.length <= batchSize) {
      return this.generateFlashcardBatch(terms);
    }

    const allCards: GeneratedFlashcardItem[] = [];
    for (let i = 0; i < terms.length; i += batchSize) {
      const chunk = terms.slice(i, i + batchSize);
      const batchResult = await this.generateFlashcardBatch(chunk);
      allCards.push(...batchResult);
    }

    return allCards;
  }

  private async generateFlashcardBatch(terms: FlashcardGenerationInput[]): Promise<GeneratedFlashcardItem[]> {
    if (terms.length === 0) return [];

    const formattedTerms = terms.map((item) => {
      if (typeof item === "string") return item;
      return [
        `Word: "${item.term}"`,
        item.meaningVi ? `Target Vietnamese meaning: "${item.meaningVi}"` : null,
        item.exampleEn ? `Context sentence: "${item.exampleEn}"` : null,
      ]
        .filter(Boolean)
        .join(" | ");
    });

    const systemPrompt =
      "You are an expert English lexicographer and vocabulary educator creating high-quality flashcards for Vietnamese learners. You must respond in valid JSON format only.\n\n" +
      "Standards:\n" +
      "1. Term: Preserve the exact canonical term provided. Do not alter spelling or omit components of multi-word expressions.\n" +
      "2. Part of Speech: Identify the precise part of speech (noun, verb, adjective, adverb, phrase, phrasal verb).\n" +
      "3. Vietnamese Meaning: Provide 1–2 natural, concise core Vietnamese meanings. Avoid awkward literal translation.\n" +
      "4. English Definition: Clear, concise, learner-friendly definition (CEFR-appropriate). Never produce circular definitions.\n" +
      "5. English Example: Write ONE authentic, grammatically correct sentence demonstrating the term's meaning naturally in context. Multi-word expressions and phrasal verbs must be used in their correct idiomatic sense (e.g. 'look up to' = admire someone, 'call in' = summon/request someone's presence).\n" +
      "6. Vietnamese Example Translation: Accurate natural Vietnamese translation of the example sentence.\n" +
      "7. Objective & Unbiased: Do NOT force narrow domain-specific senses (e.g., HR, medical) unless explicitly specified in the input.\n" +
      "8. Clean text: No Markdown formatting (**bold**, *italic*). Output valid JSON only.";

    const prompt = `Generate a JSON object containing high-quality flashcards for these English vocabulary items:
${JSON.stringify(formattedTerms, null, 2)}

Respond with JSON only matching this schema:
{"flashcards":[{"term":"string","meaningVi":"string","definitionEn":"string","ipa":"string or null","partOfSpeech":"string or null","cefr":"A1 | A2 | B1 | B2 | C1 | C2 | null","exampleEn":"string","exampleVi":"string","visualScore":0,"imageSearchQuery":"string or null"}]}`;

    let generated: GeneratedFlashcardItem[] = [];
    try {
      const response = await this.callStructured({
        systemPrompt,
        prompt,
        schema: aiBatchFlashcardResponseSchema,
        temperature: AI_CONFIG.flashcards.temperature,
        topP: AI_CONFIG.flashcards.topP,
        numCtx: AI_CONFIG.flashcardContextSize,
        think: AI_CONFIG.flashcards.think,
        maxRetries: 1,
        timeoutMs: AI_CONFIG.flashcards.timeoutMs,
      });
      generated = response.flashcards;
    } catch (err) {
      console.warn(`[AIService] Flashcard batch (${terms.length} terms) failed:`, err);
    }

    // Map by normalized term and validate card quality
    const cardMap = new Map<string, GeneratedFlashcardItem>();
    for (const card of generated) {
      const norm = normalizeTerm(card.term);
      if (isValidFlashcard(card)) {
        cardMap.set(norm, card);
      }
    }

    // Identify missing or invalid terms
    const missingInputs = terms.filter((item) => !cardMap.has(normalizeTerm(getInputTerm(item))));

    // Targeted retry for missing items ONLY
    if (missingInputs.length > 0) {
      console.warn(
        `[AIService] Targeted retry for ${missingInputs.length} missing/invalid flashcards: ${missingInputs.map(getInputTerm).join(", ")}`
      );
      try {
        const retryPrompt = `Generate a JSON object containing high-quality flashcards for these English vocabulary items:
${JSON.stringify(missingInputs.map((item) => (typeof item === "string" ? item : `Word: "${item.term}"`)), null, 2)}

Respond with JSON only matching this schema:
{"flashcards":[{"term":"string","meaningVi":"string","definitionEn":"string","ipa":"string or null","partOfSpeech":"string or null","cefr":"A1 | A2 | B1 | B2 | C1 | C2 | null","exampleEn":"string","exampleVi":"string","visualScore":0,"imageSearchQuery":"string or null"}]}`;

        const retryResponse = await this.callStructured({
          systemPrompt,
          prompt: retryPrompt,
          schema: aiBatchFlashcardResponseSchema,
          temperature: AI_CONFIG.flashcards.temperature,
          topP: AI_CONFIG.flashcards.topP,
          numCtx: AI_CONFIG.flashcardContextSize,
          think: AI_CONFIG.flashcards.think,
          maxRetries: 1,
          timeoutMs: AI_CONFIG.flashcards.timeoutMs,
        });

        for (const card of retryResponse.flashcards) {
          const norm = normalizeTerm(card.term);
          if (isValidFlashcard(card)) {
            cardMap.set(norm, card);
          }
        }
      } catch (retryErr) {
        console.warn(`[AIService] Targeted retry error:`, retryErr);
      }
    }

    // Reconcile and return in exact original order
    return reconcileFlashcards(terms, cardMap);
  }

  async generateStory({
    targetWords,
    cefr = "B1",
    length = "medium",
    topic = "Daily Life",
  }: {
    targetWords: string[];
    cefr?: StoryCefr;
    length?: StoryLength;
    topic?: StoryTopic;
  }): Promise<AIStoryResponse> {
    if (targetWords.length === 0) {
      throw new Error("At least one target word is required to generate a story.");
    }

    return this.callStructured({
      systemPrompt:
        "You are a talented author and English language teacher writing an engaging, memorable story for English learners. You must respond in valid JSON format only.",
      prompt: buildStoryPrompt({ targetWords, cefr, length, topic }),
      schema: aiStoryResponseSchema,
      temperature: AI_CONFIG.story.temperature,
      topP: AI_CONFIG.story.topP,
      numCtx: AI_CONFIG.defaultContextSize,
      think: AI_CONFIG.story.think,
      maxRetries: 1,
      timeoutMs: AI_CONFIG.story.timeoutMs,
    });
  }

  async translateInContext({
    selectedText,
    canonicalTerm,
    surroundingSentence,
    context = "",
  }: {
    selectedText: string;
    canonicalTerm?: string;
    surroundingSentence: string;
    context?: string;
  }): Promise<ContextualTranslationResponse> {
    const surfaceForm = selectedText.trim();
    const term = canonicalTerm?.trim() || surfaceForm;
    if (!surfaceForm || !term) throw new Error("Selected word is empty.");

    return this.callStructured({
      systemPrompt:
        "You are an expert bilingual English-Vietnamese translator and vocabulary instructor. You must respond in valid JSON format only.",
      prompt: `Return JSON only for the selected text in its exact context.

Canonical vocabulary term: "${term}"
Exact surface form: "${surfaceForm}"
Surrounding sentence: "${surroundingSentence}"
Context paragraph: "${context}"

Use natural Vietnamese for meaningVi, contextualMeaningVi, definitionVi, and exampleVi. Include IPA, partOfSpeech, definitionEn, exampleEn (the surrounding sentence), and CEFR. Respond with JSON only:
{"selectedText":"string","meaningVi":"string","contextualMeaningVi":"string","definitionVi":"string","ipa":"string or null","partOfSpeech":"string or null","definitionEn":"string","exampleEn":"string","exampleVi":"string","cefr":"A1 | A2 | B1 | B2 | C1 | C2 | null"}`,
      schema: contextualTranslationResponseSchema,
      temperature: AI_CONFIG.contextualTranslation.temperature,
      topP: AI_CONFIG.contextualTranslation.topP,
      numCtx: AI_CONFIG.defaultContextSize,
      think: AI_CONFIG.contextualTranslation.think,
      maxRetries: 1,
      timeoutMs: AI_CONFIG.contextualTranslation.timeoutMs,
    });
  }

  async callStructured<T>({
    systemPrompt,
    prompt,
    schema,
    temperature = 0.2,
    topP,
    numCtx,
    think,
    maxRetries = 1,
    timeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS,
  }: StructuredGenerationOptions<T>): Promise<T> {
    let malformedAttempts = 0;

    while (true) {
      try {
        const rawText = await this.ollama.generateJson({
          systemPrompt,
          prompt,
          temperature,
          topP,
          numCtx,
          think,
          timeoutMs,
        });
        const result = parseStructuredResponse(rawText, schema);
        console.info(`[AI] provider=ollama model=${this.model} result=success`);
        return result;
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new AIError(String(error));
        if (!(normalizedError instanceof AIParseError || normalizedError instanceof AIValidationError)) {
          throw normalizedError;
        }
        if (malformedAttempts >= maxRetries) {
          throw new AIInvalidResponseError(undefined, normalizedError);
        }
        malformedAttempts++;
        console.warn(
          `[AI] provider=ollama model=${this.model} result=invalid_json retry=${malformedAttempts}`
        );
      }
    }
  }
}

function parseStructuredResponse<T>(rawText: string, schema: ZodSchema<T>): T {
  const parsed = cleanAndParseJson<unknown>(rawText);
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new AIValidationError(
      `AI schema validation error: ${JSON.stringify(validated.error.format())}`,
      validated.error.issues
    );
  }
  return validated.data;
}

function isValidFlashcard(card: GeneratedFlashcardItem): boolean {
  if (!card || typeof card !== "object") return false;
  if (!card.term || typeof card.term !== "string" || !card.term.trim()) return false;
  if (!card.meaningVi || typeof card.meaningVi !== "string" || !card.meaningVi.trim()) return false;
  if (normalizeTerm(card.meaningVi) === normalizeTerm(card.term)) return false;
  if (!card.definitionEn || typeof card.definitionEn !== "string" || !card.definitionEn.trim()) return false;
  if (normalizeTerm(card.definitionEn) === normalizeTerm(card.term)) return false;
  if (!card.exampleEn || typeof card.exampleEn !== "string" || !card.exampleEn.trim()) return false;
  if (!card.exampleVi || typeof card.exampleVi !== "string" || !card.exampleVi.trim()) return false;
  return true;
}

function reconcileFlashcards(
  requestedTerms: FlashcardGenerationInput[],
  generatedCards: GeneratedFlashcardItem[] | Map<string, GeneratedFlashcardItem>
): GeneratedFlashcardItem[] {
  const cardMap =
    generatedCards instanceof Map
      ? generatedCards
      : new Map(generatedCards.map((card) => [normalizeTerm(card.term), card]));

  const missingTerms = requestedTerms
    .map(getInputTerm)
    .filter((term) => !cardMap.has(normalizeTerm(term)));
  if (missingTerms.length > 0) {
    throw new AIInvalidResponseError(
      `Ollama did not return flashcards for: ${missingTerms.join(", ")}`
    );
  }

  return requestedTerms.map((input) => {
    const term = getInputTerm(input);
    const card = cardMap.get(normalizeTerm(term))!;
    return { ...card, term };
  });
}

function getInputTerm(input: FlashcardGenerationInput): string {
  return typeof input === "string" ? input : input.term;
}

export const aiService: AIService = new OllamaAIService({
  baseUrl: process.env.OLLAMA_BASE_URL,
  model: process.env.OLLAMA_MODEL,
});
