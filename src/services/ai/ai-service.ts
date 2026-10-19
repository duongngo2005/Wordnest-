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

export interface AIService {
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
  callStructured<T>(options: {
    systemPrompt?: string;
    prompt: string;
    schema: ZodSchema<T>;
    temperature?: number;
    topP?: number;
    numCtx?: number;
    think?: boolean;
    maxRetries?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<T>;
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
  signal?: AbortSignal;
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

Known canonical vocabulary term (may be the selected surface form): "${term}"
Exact surface form: "${surfaceForm}"
Surrounding sentence: "${surroundingSentence}"
Context paragraph: "${context}"

Use natural Vietnamese for meaningVi, contextualMeaningVi, definitionVi, and exampleVi. Return canonicalTerm as the lexical target suitable for a flashcard when the context makes it clear: use a canonical verb base form (for example attended → attend), singular noun where appropriate, or complete multi-word lexical unit. Do not use heuristic suffix stripping; infer it from the sentence and lexical use. Keep canonicalTerm null only when the selected surface itself is the only reliable target. Include IPA, partOfSpeech, definitionEn, exampleEn (the surrounding sentence), and CEFR. Respond with JSON only:
{"selectedText":"string","canonicalTerm":"string or null","meaningVi":"string","contextualMeaningVi":"string","definitionVi":"string or null","ipa":"string or null","partOfSpeech":"string or null","definitionEn":"string","exampleEn":"string","exampleVi":"string","cefr":"A1 | A2 | B1 | B2 | C1 | C2 | null"}`,
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
    signal,
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
          signal,
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

export const aiService: AIService = new OllamaAIService({
  baseUrl: process.env.OLLAMA_BASE_URL,
  model: process.env.OLLAMA_MODEL,
});
