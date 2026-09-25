import {
  aiBatchFlashcardResponseSchema,
  GeneratedFlashcardItem,
  AUTO_IMAGE_MIN_SCORE,
} from "@/lib/validation/flashcard";
import {
  aiStoryResponseSchema,
  AIStoryResponse,
  contextualTranslationResponseSchema,
  ContextualTranslationResponse,
  StoryCefr,
  StoryLength,
  StoryTopic,
} from "@/lib/validation/story";
import { buildStoryPrompt } from "@/lib/story/story-prompt";
import { normalizeTerm } from "@/services/vocabulary/parser";
import { ZodSchema } from "zod";
import {
  cleanAndParseJson,
  AIError,
  AIQuotaExceededError,
  AIRateLimitError,
  AITimeoutError,
  AIParseError,
  AIValidationError,
  AINoKeysConfiguredError,
  AIInvalidResponseError,
  AIProviderUnavailableError,
} from "./ai-core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function configuredGeminiTimeoutMs(): number {
  const configured = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS);
  // Keep the request bounded even if a deployment variable is malformed.
  return Number.isInteger(configured) && configured >= 1_000 && configured <= 120_000
    ? configured
    : 45_000;
}

// A 429 rotates immediately. This longer timeout is for slow healthy requests,
// which avoids prematurely moving through the key pool on transient latency.
const DEFAULT_GEMINI_TIMEOUT_MS = configuredGeminiTimeoutMs();
// A batch can contain up to 12 full bilingual flashcards.
const FLASHCARD_BATCH_TIMEOUT_MS = Math.max(DEFAULT_GEMINI_TIMEOUT_MS, 60_000);

export const OPENROUTER_FALLBACK_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openrouter/free",
] as const;

type OpenRouterFallbackModel = (typeof OPENROUTER_FALLBACK_MODELS)[number];

const OPENROUTER_STRUCTURED_FALLBACK_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
] as const satisfies readonly OpenRouterFallbackModel[];

export function isAllowedOpenRouterModel(model: string): model is OpenRouterFallbackModel {
  return OPENROUTER_FALLBACK_MODELS.includes(model as OpenRouterFallbackModel);
}

function isMalformedStructuredOutput(error: Error): boolean {
  return error instanceof AIParseError || error instanceof AIValidationError;
}

/**
 * Preserve Gemini's HTTP status so fallback policy is decided from the status,
 * never from untrusted provider error text.
 */
class GeminiHttpError extends AIError {
  constructor(
    public readonly status: number,
    originalError?: unknown
  ) {
    super(`Gemini API HTTP ${status}`, originalError);
    this.name = "GeminiHttpError";
  }
}

class OpenRouterHttpError extends AIError {
  constructor(
    public readonly status: number,
    public readonly errorCode: string | null,
    public readonly providerMessage: string | null
  ) {
    super(`OpenRouter API HTTP ${status}`);
    this.name = "OpenRouterHttpError";
  }
}

function safeDiagnosticValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 240) : null;
}

function openRouterFailureDiagnostics(error: Error): string {
  if (error instanceof OpenRouterHttpError) {
    return [
      `http_status=${error.status}`,
      `error_code=${error.errorCode || "unknown"}`,
      `error_message=${error.providerMessage || "unknown"}`,
    ].join(" ");
  }

  if (error instanceof AITimeoutError) return "error_type=timeout";
  return "error_type=request_failed";
}

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

// Built-in educational dictionary for core terms and offline fallback
const CURATED_DICTIONARY: Record<
  string,
  Omit<GeneratedFlashcardItem, "term" | "visualScore"> & { visualScore?: number }
> = {
  apple: {
    meaningVi: "quả táo",
    definitionEn: "a round fruit with red, yellow, or green skin and firm white flesh",
    ipa: "/ˈæp.əl/",
    partOfSpeech: "noun",
    cefr: "A1",
    exampleEn: "She sliced a fresh red apple for breakfast.",
    exampleVi: "Cô ấy cắt một quả táo đỏ tươi cho bữa sáng.",
    visualScore: 95,
    imageUseful: true,
    imageSearchQuery: "fresh red apple fruit",
  },
  resilient: {
    meaningVi: "kiên cường, có khả năng phục hồi nhanh",
    definitionEn: "able to quickly recover from difficulties or withstand shock",
    ipa: "/rɪˈzɪl.jənt/",
    partOfSpeech: "adjective",
    cefr: "B2",
    exampleEn: "The community remained resilient and rebuilt the town after the storm.",
    exampleVi: "Cộng đồng vẫn kiên cường và xây dựng lại thị trấn sau cơn bão.",
    visualScore: 35,
    imageUseful: false,
    imageSearchQuery: null,
  },
  "take responsibility": {
    meaningVi: "nhận trách nhiệm, chịu trách nhiệm",
    definitionEn: "to accept duty or blame for an action or situation",
    ipa: "/teɪk rɪˌspɒn.sɪˈbɪl.ə.ti/",
    partOfSpeech: "phrase",
    cefr: "B1",
    exampleEn: "A mature leader knows how to take responsibility when mistakes happen.",
    exampleVi: "Một người lãnh đạo trưởng thành biết cách nhận trách nhiệm khi xảy ra sai lầm.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  reluctant: {
    meaningVi: "lưỡng lự, miễn cưỡng",
    definitionEn: "unwilling and hesitant to do something",
    ipa: "/rɪˈlʌk.tənt/",
    partOfSpeech: "adjective",
    cefr: "B2",
    exampleEn: "He was reluctant to admit that he needed help.",
    exampleVi: "Anh ấy miễn cưỡng thừa nhận rằng mình cần sự giúp đỡ.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  "cloud computing": {
    meaningVi: "điện toán đám mây",
    definitionEn: "the practice of using a network of remote servers hosted on the internet to store and manage data",
    ipa: "/ˌklaʊd kəmˈpjuː.tɪŋ/",
    partOfSpeech: "noun phrase",
    cefr: "B2",
    exampleEn: "Cloud computing allows companies to scale resources on demand.",
    exampleVi: "Điện toán đám mây cho phép các công ty mở rộng tài nguyên theo nhu cầu.",
    visualScore: 55,
    imageUseful: false,
    imageSearchQuery: null,
  },
  banana: {
    meaningVi: "quả chuối",
    definitionEn: "a long curved fruit with a yellow skin and soft sweet flesh",
    ipa: "/bəˈnɑː.nə/",
    partOfSpeech: "noun",
    cefr: "A1",
    exampleEn: "Monkeys love eating ripe bananas.",
    exampleVi: "Khỉ rất thích ăn những quả chuối chín.",
    visualScore: 95,
    imageUseful: true,
    imageSearchQuery: "yellow ripe banana bunch",
  },
  meticulous: {
    meaningVi: "tỉ mỉ, cẩn thận từng chi tiết",
    definitionEn: "showing great attention to detail; very careful and precise",
    ipa: "/məˈtɪk.jə.ləs/",
    partOfSpeech: "adjective",
    cefr: "C1",
    exampleEn: "He kept meticulous records of all his research experiments.",
    exampleVi: "Anh ấy ghi chép tỉ mỉ về tất cả các thí nghiệm nghiên cứu của mình.",
    visualScore: 25,
    imageUseful: false,
    imageSearchQuery: null,
  },
  hesitant: {
    meaningVi: "ngập ngừng, do dự",
    definitionEn: "tentative, unsure, or slow in acting or speaking",
    ipa: "/ˈhez.ɪ.tənt/",
    partOfSpeech: "adjective",
    cefr: "B2",
    exampleEn: "She was hesitant to share her true feelings at first.",
    exampleVi: "Lúc đầu cô ấy do dự khi chia sẻ cảm xúc thật của mình.",
    visualScore: 25,
    imageUseful: false,
    imageSearchQuery: null,
  },
  challenge: {
    meaningVi: "thử thách, thách thức",
    definitionEn: "a task or situation that tests someone's abilities",
    ipa: "/ˈtʃæl.ɪndʒ/",
    partOfSpeech: "noun",
    cefr: "B1",
    exampleEn: "Learning a new language is always an exciting challenge.",
    exampleVi: "Học một ngôn ngữ mới luôn là một thử thách thú vị.",
    visualScore: 35,
    imageUseful: false,
    imageSearchQuery: null,
  },
  courage: {
    meaningVi: "lòng dũng cảm, sự can đảm",
    definitionEn: "the ability to do something that frightens one; bravery",
    ipa: "/ˈkʌr.ɪdʒ/",
    partOfSpeech: "noun",
    cefr: "B1",
    exampleEn: "It takes courage to speak the truth in difficult times.",
    exampleVi: "Cần có lòng dũng cảm để nói lên sự thật trong những thời khắc khó khăn.",
    visualScore: 20,
    imageUseful: false,
    imageSearchQuery: null,
  },
  opportunity: {
    meaningVi: "cơ hội, thời cơ",
    definitionEn: "a set of circumstances that makes it possible to do something",
    ipa: "/ˌɒp.əˈtjuː.nə.ti/",
    partOfSpeech: "noun",
    cefr: "B1",
    exampleEn: "This internship is a great opportunity to gain practical skills.",
    exampleVi: "Kỳ thực tập này là một cơ hội tuyệt vời để tích lũy kỹ năng thực tế.",
    visualScore: 30,
    imageUseful: false,
    imageSearchQuery: null,
  },
  persistence: {
    meaningVi: "sự kiên trì, bền bỉ",
    definitionEn: "firm or obstinate continuance in a course of action in spite of difficulty",
    ipa: "/pəˈsɪs.təns/",
    partOfSpeech: "noun",
    cefr: "B2",
    exampleEn: "Success often comes to those who have patience and persistence.",
    exampleVi: "Thành công thường đến với những ai có sự kiên nhẫn và bền bỉ.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  decision: {
    meaningVi: "quyết định",
    definitionEn: "a conclusion or resolution reached after consideration",
    ipa: "/dɪˈsɪʒ.ən/",
    partOfSpeech: "noun",
    cefr: "A2",
    exampleEn: "She made an important decision to pursue higher education abroad.",
    exampleVi: "Cô ấy đã đưa ra quyết định quan dọng là đi du học nước ngoài.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  "abide by": {
    meaningVi: "tuân thủ, chấp hành",
    definitionEn: "to accept and follow a rule, decision, or instruction",
    ipa: "/əˈbaɪd baɪ/",
    partOfSpeech: "phrasal verb",
    cefr: "B2",
    exampleEn: "All employees must abide by the safety rules.",
    exampleVi: "Tất cả nhân viên phải tuân thủ các quy tắc an toàn.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  agreement: {
    meaningVi: "thỏa thuận; sự đồng ý",
    definitionEn: "an arrangement or decision that people accept after discussing it",
    ipa: "/əˈɡriːmənt/",
    partOfSpeech: "noun",
    cefr: "B1",
    exampleEn: "The two companies reached an agreement after several meetings.",
    exampleVi: "Hai công ty đã đạt được thỏa thuận sau vài cuộc họp.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  assurance: {
    meaningVi: "sự đảm bảo; lời cam đoan",
    definitionEn: "a promise or statement intended to make someone feel certain or confident",
    ipa: "/əˈʃʊrəns/",
    partOfSpeech: "noun",
    cefr: "B2",
    exampleEn: "Her assurance helped the team feel more confident about the plan.",
    exampleVi: "Lời đảm bảo của cô ấy giúp cả nhóm tự tin hơn về kế hoạch.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  cancel: {
    meaningVi: "hủy bỏ",
    definitionEn: "to decide that a planned event, activity, or arrangement will not happen",
    ipa: "/ˈkæn.səl/",
    partOfSpeech: "verb",
    cefr: "A2",
    exampleEn: "The airline had to cancel the flight because of the storm.",
    exampleVi: "Hãng hàng không phải hủy chuyến bay vì cơn bão.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  determine: {
    meaningVi: "xác định; quyết định",
    definitionEn: "to discover or establish something after considering the facts",
    ipa: "/dɪˈtɜːmɪn/",
    partOfSpeech: "verb",
    cefr: "B1",
    exampleEn: "We need more evidence to determine the cause of the problem.",
    exampleVi: "Chúng ta cần thêm bằng chứng để xác định nguyên nhân của vấn đề.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  engage: {
    meaningVi: "tham gia; thu hút",
    definitionEn: "to become involved in an activity or to hold someone's interest",
    ipa: "/ɪnˈɡeɪdʒ/",
    partOfSpeech: "verb",
    cefr: "B2",
    exampleEn: "The teacher used games to engage the students in the lesson.",
    exampleVi: "Giáo viên dùng trò chơi để thu hút học sinh tham gia vào bài học.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  establish: {
    meaningVi: "thành lập; thiết lập",
    definitionEn: "to create an organization, system, or relationship that will continue",
    ipa: "/ɪˈstæblɪʃ/",
    partOfSpeech: "verb",
    cefr: "B2",
    exampleEn: "The company was established in 2010.",
    exampleVi: "Công ty được thành lập vào năm 2010.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  obligate: {
    meaningVi: "bắt buộc; buộc phải",
    definitionEn: "to bind someone legally or morally to do something",
    ipa: "/ˈɒblɪɡeɪt/",
    partOfSpeech: "verb",
    cefr: "C1",
    exampleEn: "The contract obligates both sides to protect customer data.",
    exampleVi: "Hợp đồng buộc cả hai bên phải bảo vệ dữ liệu khách hàng.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  party: {
    meaningVi: "bữa tiệc; buổi liên hoan",
    definitionEn: "a social gathering of people who come together to celebrate or have fun",
    ipa: "/ˈpɑːti/",
    partOfSpeech: "noun",
    cefr: "A1",
    exampleEn: "We are having a party for Lan's birthday on Saturday.",
    exampleVi: "Chúng tôi sẽ tổ chức tiệc sinh nhật cho Lan vào thứ Bảy.",
    imageUseful: true,
    imageSearchQuery: "birthday party celebration decorations",
  },
  provision: {
    meaningVi: "sự cung cấp; điều khoản",
    definitionEn: "the act of supplying something needed, or a condition written in an agreement",
    ipa: "/prəˈvɪʒən/",
    partOfSpeech: "noun",
    cefr: "C1",
    exampleEn: "The contract includes a provision for early cancellation.",
    exampleVi: "Hợp đồng bao gồm một điều khoản về việc hủy sớm.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  resolve: {
    meaningVi: "giải quyết; quyết tâm",
    definitionEn: "to find a solution to a problem or disagreement",
    ipa: "/rɪˈzɒlv/",
    partOfSpeech: "verb",
    cefr: "B2",
    exampleEn: "The manager helped the two teams resolve their disagreement.",
    exampleVi: "Người quản lý đã giúp hai nhóm giải quyết bất đồng của họ.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  specify: {
    meaningVi: "nêu rõ; quy định rõ",
    definitionEn: "to state something clearly and exactly",
    ipa: "/ˈspesɪfaɪ/",
    partOfSpeech: "verb",
    cefr: "B2",
    exampleEn: "Please specify the date and time of the meeting.",
    exampleVi: "Vui lòng nêu rõ ngày và giờ của cuộc họp.",
    imageUseful: false,
    imageSearchQuery: null,
  },
};

interface PublicDictionaryEntry {
  definitionEn: string;
  ipa: string | null;
  partOfSpeech: string | null;
  exampleEn: string | null;
}

export class GeminiAIService implements AIService {
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;
  private rateLimitedUntil: Map<string, number> = new Map();
  private model: string;
  private openRouterApiKey: string;

  constructor(
    apiKeyOrKeys?: string | string[],
    model = "gemini-3.6-flash",
    openRouterApiKey = process.env.OPENROUTER_API_KEY || ""
  ) {
    const configuredKeyPool = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    const rawKeys = apiKeyOrKeys || [
      configuredKeyPool,
      process.env.GEMINI_API_KEYS_EXTRA,
      process.env.GEMINI_API_KEYS_ADDITIONAL,
    ].filter(Boolean).join(",");
    this.apiKeys = this.parseKeys(rawKeys);
    this.model = process.env.GEMINI_MODEL || model;
    this.openRouterApiKey = openRouterApiKey.trim();
  }

  private parseKeys(input: string | string[]): string[] {
    if (Array.isArray(input)) {
      return input.map((k) => k.trim()).filter(Boolean);
    }
    if (typeof input === "string") {
      return input
        .split(/[,;\n\r]+/)
        .map((k) => k.trim())
        .filter(Boolean);
    }
    return [];
  }

  get hasKeys(): boolean {
    return this.apiKeys.length > 0;
  }

  get hasOpenRouterKey(): boolean {
    return this.openRouterApiKey.length > 0;
  }

  get apiKey(): string {
    return this.apiKeys[0] || "";
  }

  /**
   * Retrieves the next available API key that is not currently cooling down from a 429/quota error.
   */
  private getNextAvailableKey(): { key: string; index: number } {
    if (this.apiKeys.length === 0) {
      throw new Error("No Gemini API keys configured");
    }

    const now = Date.now();
    const totalKeys = this.apiKeys.length;

    // First try to find a key not in cooldown, starting from currentKeyIndex
    for (let i = 0; i < totalKeys; i++) {
      const idx = (this.currentKeyIndex + i) % totalKeys;
      const key = this.apiKeys[idx];
      const cooldownUntil = this.rateLimitedUntil.get(key) || 0;

      if (now >= cooldownUntil) {
        this.currentKeyIndex = idx;
        return { key, index: idx };
      }
    }

    // If all keys are in cooldown, pick the one expiring earliest
    let earliestKey = this.apiKeys[0];
    let earliestIndex = 0;
    let minCooldown = this.rateLimitedUntil.get(earliestKey) || Infinity;

    for (let i = 1; i < totalKeys; i++) {
      const key = this.apiKeys[i];
      const cooldown = this.rateLimitedUntil.get(key) || Infinity;
      if (cooldown < minCooldown) {
        minCooldown = cooldown;
        earliestKey = key;
        earliestIndex = i;
      }
    }

    this.currentKeyIndex = earliestIndex;
    return { key: earliestKey, index: earliestIndex };
  }

  /**
   * Marks an API key as rate-limited with a cooldown duration.
   */
  private markKeyRateLimited(key: string, cooldownSeconds = 60) {
    console.warn(
      `[GeminiAIService] A Gemini API key was rate-limited (429 / Quota). Cooldown for ${cooldownSeconds}s.`
    );
    this.rateLimitedUntil.set(key, Date.now() + cooldownSeconds * 1000);
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
  }

  /**
   * Centralized Gemini API caller with automatic API key rotation and rate-limit handling.
   */
  private async callGeminiWithRotation(
    payload: {
      contents: unknown[];
      generationConfig?: unknown;
    },
    timeoutMs = DEFAULT_GEMINI_TIMEOUT_MS
  ): Promise<string> {
    if (!this.hasKeys) {
      throw new AINoKeysConfiguredError("No Gemini API keys configured");
    }

    const totalKeys = this.apiKeys.length;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < totalKeys; attempt++) {
      const { key, index } = this.getNextAvailableKey();
      const mask = `key #${index + 1}`;

      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${key}`;
        let response: Response;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (fetchErr: unknown) {
          if (
            fetchErr instanceof Error &&
            (fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError")
          ) {
            throw new AITimeoutError(`Gemini request timed out after ${timeoutMs}ms (${mask})`);
          }
          throw new AIProviderUnavailableError("Gemini provider unavailable.", fetchErr);
        }

        if (response.status === 429) {
          let cooldown = 60;
          let quotaExhausted = false;
          try {
            const errJson: unknown = await response.json();
            const providerError = isRecord(errJson) && isRecord(errJson.error) ? errJson.error : null;
            quotaExhausted = providerError?.status === "RESOURCE_EXHAUSTED";
            const details =
              providerError && Array.isArray(providerError.details)
                ? providerError.details
                : [];
            const delay = details.find(
              (detail): detail is Record<string, unknown> =>
                isRecord(detail) && typeof detail.retryDelay === "string"
            );
            const delayStr = delay?.retryDelay;
            if (typeof delayStr === "string" && delayStr) {
              const seconds = parseInt(delayStr, 10);
              if (!isNaN(seconds) && seconds > 0) cooldown = seconds + 2;
            }
          } catch {
            // ignore
          }

          this.markKeyRateLimited(key, cooldown);
          lastError = quotaExhausted
            ? new AIQuotaExceededError(`Gemini key ${mask} quota exhausted`, cooldown)
            : new AIRateLimitError(`Gemini key ${mask} rate-limited (HTTP 429)`, cooldown);

          if (totalKeys > 1 && attempt < totalKeys - 1) {
            console.warn(
              `[GeminiAIService] Key ${mask} hit rate-limit. Switching to next available key...`
            );
            continue;
          }
          throw lastError;
        }

        if (response.status === 503) {
          console.warn(
            `[GeminiAIService] Key ${mask} received HTTP 503 (model overloaded / service unavailable).`
          );
          if (totalKeys > 1 && attempt < totalKeys - 1) {
            console.warn(`[GeminiAIService] Switching to next key due to 503...`);
            this.currentKeyIndex = (index + 1) % totalKeys;
            continue;
          }
          await new Promise((res) => setTimeout(res, 800));
        }

        if (!response.ok) {
          const errorText = await response.text();
          const normalizedErrorText = errorText.toLowerCase();
          const isQuotaExhausted =
            normalizedErrorText.includes("resource_exhausted") ||
            normalizedErrorText.includes("quota exceeded") ||
            normalizedErrorText.includes("quota exhausted");
          if (isQuotaExhausted) {
            this.markKeyRateLimited(key, 60);
            lastError = new AIQuotaExceededError(`Gemini key ${mask} quota exhausted`, 60);
            if (totalKeys > 1 && attempt < totalKeys - 1) {
              console.warn(
                `[GeminiAIService] Quota exhausted on key ${mask}. Switching to next key...`
              );
              continue;
            }
            throw lastError;
          }
          throw new GeminiHttpError(response.status, errorText);
        }

        let data: unknown;
        try {
          data = await response.json();
        } catch (error) {
          throw new AIParseError(`Invalid JSON envelope from Gemini API (${mask})`, String(error));
        }
        const candidates = isRecord(data) && Array.isArray(data.candidates) ? data.candidates : [];
        const firstCandidate = candidates[0];
        const content = isRecord(firstCandidate) && isRecord(firstCandidate.content)
          ? firstCandidate.content
          : null;
        const parts = content && Array.isArray(content.parts) ? content.parts : [];
        const firstPart = parts[0];
        const rawText = isRecord(firstPart) ? firstPart.text : null;
        if (typeof rawText !== "string" || !rawText.trim()) {
          throw new AIParseError(`Empty response from Gemini API (${mask})`, "");
        }

        // Successfully generated: clear any rate-limit record and advance key index
        this.rateLimitedUntil.delete(key);
        this.currentKeyIndex = (index + 1) % totalKeys;

        console.info(`[AI] provider=gemini model=${this.model} result=success`);

        return rawText;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new AIError(String(err));
        const message = lastError.message;
        if (
          message.includes("429") ||
          message.includes("RESOURCE_EXHAUSTED")
        ) {
          this.markKeyRateLimited(key, 60);
          if (attempt < totalKeys - 1) continue;
        }

        if (this.shouldTryNextGeminiKey(lastError) && attempt < totalKeys - 1) {
          this.currentKeyIndex = (index + 1) % totalKeys;
          console.warn(
            `[GeminiAIService] Key ${mask} had a transient failure. Switching to next available key...`
          );
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new AIError("All Gemini API keys exhausted");
  }

  private isGeminiFallbackEligible(error: Error): boolean {
    if (error instanceof AIRateLimitError || error instanceof AIQuotaExceededError || error instanceof AITimeoutError) {
      return true;
    }

    if (error instanceof GeminiHttpError) {
      return error.status === 502 || error.status === 503 || error.status === 504;
    }

    return error instanceof AIProviderUnavailableError;
  }

  /**
   * A transient failure can be isolated to one Gemini key or its serving path.
   * Try the remaining configured keys before entering the external fallback chain.
   */
  private shouldTryNextGeminiKey(error: Error): boolean {
    if (error instanceof AITimeoutError || error instanceof AIProviderUnavailableError) {
      return true;
    }

    return error instanceof GeminiHttpError && [502, 503, 504].includes(error.status);
  }

  private parseStructuredResponse<T>(rawText: string, schema?: ZodSchema<T>): T {
    const parsedJson = cleanAndParseJson<T>(rawText);

    if (!schema) {
      return parsedJson;
    }

    const validated = schema.safeParse(parsedJson);
    if (!validated.success) {
      throw new AIValidationError(
        `AI schema validation error: ${JSON.stringify(validated.error.format())}`,
        validated.error.issues
      );
    }

    return validated.data;
  }

  private async callOpenRouterModel(
    model: OpenRouterFallbackModel,
    prompt: string,
    temperature: number,
    timeoutMs: number,
    responseFormat: "json_object" | "none" = "json_object"
  ): Promise<string> {
    if (!isAllowedOpenRouterModel(model)) {
      throw new AIError(`Blocked OpenRouter model outside the allowlist: ${model}`);
    }

    let response: Response;
    try {
      response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.openRouterApiKey}`,
          "Content-Type": "application/json",
          "X-OpenRouter-Title": "WordNest",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          ...(responseFormat === "json_object"
            ? { response_format: { type: "json_object" } }
            : {}),
          temperature,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new AITimeoutError(`OpenRouter request timed out for model ${model}`);
      }
      throw new AIError(`OpenRouter request failed for model ${model}`, error);
    }

    if (!response.ok) {
      const responseText = await response.text();
      let errorPayload: unknown;
      try {
        errorPayload = JSON.parse(responseText);
      } catch {
        errorPayload = undefined;
      }
      const providerError =
        isRecord(errorPayload) && isRecord(errorPayload.error)
          ? errorPayload.error
          : null;
      throw new OpenRouterHttpError(
        response.status,
        safeDiagnosticValue(providerError?.code),
        safeDiagnosticValue(providerError?.message)
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new AIParseError(`Invalid JSON envelope from OpenRouter model ${model}`, String(error));
    }

    const choices = isRecord(payload) && Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = choices[0];
    const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new AIParseError(`Empty response from OpenRouter model ${model}`, "");
    }

    return content;
  }

  private async callOpenRouterStructured<T>(options: {
    prompt: string;
    schema?: ZodSchema<T>;
    temperature: number;
    timeoutMs: number;
    reason: string;
    responseFormat?: "json_object" | "none";
  }): Promise<T> {
    let lastError: Error | undefined;

    for (const model of OPENROUTER_STRUCTURED_FALLBACK_MODELS) {
      for (let malformedAttempt = 0; malformedAttempt <= 1; malformedAttempt++) {
        try {
          const rawText = await this.callOpenRouterModel(
            model,
            options.prompt,
            options.temperature,
            options.timeoutMs,
            options.responseFormat
          );
          const result = this.parseStructuredResponse(rawText, options.schema);
          console.info(`[AI] provider=openrouter model=${model} result=success`);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new AIError(String(error));

          if (isMalformedStructuredOutput(lastError) && malformedAttempt === 0) {
            console.warn(
              `[AI] provider=openrouter model=${model} fallback_reason=${options.reason} result=invalid_json retry=1`
            );
            continue;
          }

          const result = isMalformedStructuredOutput(lastError)
            ? "invalid_json"
            : "request_failed";
          console.warn(
            `[AI] provider=openrouter model=${model} fallback_reason=${options.reason} result=${result} ${openRouterFailureDiagnostics(lastError)}`
          );
          if (isMalformedStructuredOutput(lastError)) {
            throw new AIInvalidResponseError(undefined, lastError);
          }
          break;
        }
      }
    }

    throw new AIProviderUnavailableError(undefined, lastError);
  }

  /**
   * Sends structured requests to Gemini first. OpenRouter is used only for
   * Gemini quota, timeout, HTTP 502/503/504, or provider-unavailable failures.
   */
  async callGeminiStructured<T>(options: {
    prompt: string;
    schema?: ZodSchema<T>;
    temperature?: number;
    maxRetries?: number;
    timeoutMs?: number;
    fallback?: () => Promise<T> | T;
    openRouterResponseFormat?: "json_object" | "none";
  }): Promise<T> {
    const {
      prompt,
      schema,
      temperature = 0.2,
      maxRetries = 2,
      timeoutMs = DEFAULT_GEMINI_TIMEOUT_MS,
      fallback,
      openRouterResponseFormat = "json_object",
    } = options;

    if (!this.hasKeys) {
      if (fallback) {
        return await fallback();
      }
      throw new AINoKeysConfiguredError();
    }

    let malformedAttempts = 0;
    while (true) {
      try {
        const rawText = await this.callGeminiWithRotation(
          {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature,
            },
          },
          timeoutMs
        );
        return this.parseStructuredResponse(rawText, schema);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new AIError(String(err));

        if (isMalformedStructuredOutput(error)) {
          if (malformedAttempts < Math.min(maxRetries, 1)) {
            malformedAttempts++;
            console.warn(
              `[AI] provider=gemini model=${this.model} result=invalid_json retry=${malformedAttempts}`
            );
            continue;
          }
          throw new AIInvalidResponseError(undefined, error);
        }

        if (this.isGeminiFallbackEligible(error)) {
          const reason = error instanceof AIQuotaExceededError
            ? "quota_exhausted"
            : error instanceof AIRateLimitError
            ? "rate_limited"
            : error instanceof AITimeoutError
            ? "timeout"
            : error instanceof GeminiHttpError
            ? `http_${error.status}`
            : "provider_unavailable";

          if (this.hasOpenRouterKey) {
            console.warn(
              `[AI] provider=gemini model=${this.model} result=failed fallback=openrouter reason=${reason}`
            );
            return this.callOpenRouterStructured({
              prompt,
              schema,
              temperature,
              timeoutMs,
              reason,
              responseFormat: openRouterResponseFormat,
            });
          }

          if (fallback) {
            console.warn(
              `[AI] provider=gemini model=${this.model} result=failed fallback=local reason=${reason}`
            );
            return await fallback();
          }

          throw new AIProviderUnavailableError(undefined, error);
        }

        throw error;
      }
    }
  }

  async generateFlashcards(terms: FlashcardGenerationInput[]): Promise<GeneratedFlashcardItem[]> {
    if (!terms || terms.length === 0) {
      return [];
    }

    const formattedTerms = terms.map((item) => {
      if (typeof item === "string") return item;
      const parts = [`Word: "${item.term}"`];
      if (item.meaningVi) parts.push(`Target Vietnamese meaning: "${item.meaningVi}"`);
      if (item.exampleEn) parts.push(`Context sentence: "${item.exampleEn}"`);
      return parts.join(" | ");
    });

    const prompt = `You are an expert English vocabulary teacher for Vietnamese learners.
Generate comprehensive flashcard data for the following English vocabulary items or phrases:
${JSON.stringify(formattedTerms, null, 2)}

For each term:
1. If a specific target Vietnamese meaning or context sentence is provided, you MUST strictly use that specific meaning and context for 'meaningVi', 'definitionEn', 'exampleEn', and image evaluation. If no specific context is provided, identify the most common, useful meaning for learners.
2. If it is a phrase or idiom, keep the entire phrase intact.
3. Write a concise, natural Vietnamese meaning in 'meaningVi'.
4. Provide a clear, easy-to-understand English definition in 'definitionEn'.
5. Include accurate IPA phonetics in 'ipa'.
6. State the part of speech (noun, verb, adjective, phrase, phrasal verb, etc.) in 'partOfSpeech'.
7. Assign the CEFR level strictly as one of: "A1", "A2", "B1", "B2", "C1", "C2" (or null if unclassifiable).
8. Write a natural example sentence in 'exampleEn' (reflecting the target meaning/context if provided).
9. Translate that example sentence into natural Vietnamese in 'exampleVi'.
10. Evaluate the visual memorization usefulness as an integer 'visualScore' from 0 to 100 based on the SPECIFIC meaning and example:
    - 90–100: Concrete physical objects, living creatures, specific tools, distinct shapes (e.g. parachute, microscope, giraffe, avocado).
    - 75–89: Clear physical actions, visible expressions, distinct physical states (e.g. yawn, shivering, exhausted, somersault).
    - 50–74: Generic contexts or semi-abstract settings (e.g. office, meeting, airport, customer).
    - 0–49: Purely abstract, academic, grammar, logical connectors, philosophical terms (e.g. perspective, nevertheless, articulate, comprehensive).
11. If 'visualScore' >= 75: Provide a highly specific contextual image query in 'imageSearchQuery' based on the specific meaning and example sentence (e.g. for "bank" meaning river bank, write "grassy river bank nature scenery"; for "exhausted", write "exhausted person falling asleep on desk"). NEVER search only the single raw word. If 'visualScore' < 75: Strictly set 'imageSearchQuery' to null.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "flashcards": [
    {
      "term": "string (the clean original English word/phrase without annotations)",
      "meaningVi": "string",
      "definitionEn": "string",
      "ipa": "string or null",
      "partOfSpeech": "string or null",
      "cefr": "A1 | A2 | B1 | B2 | C1 | C2 | null",
      "exampleEn": "string",
      "exampleVi": "string",
      "visualScore": number,
      "imageSearchQuery": "string or null"
    }
  ]
}`;

    const response = await this.callGeminiStructured<{ flashcards: GeneratedFlashcardItem[] }>({
      prompt,
      schema: aiBatchFlashcardResponseSchema,
      temperature: 0.2,
      maxRetries: 2,
      timeoutMs: FLASHCARD_BATCH_TIMEOUT_MS,
      fallback: async () => ({ flashcards: await this.generateFallbackFlashcards(terms) }),
    });

    if (response.flashcards.length === terms.length) {
      return response.flashcards.map((item, i) => {
        const orig = terms[i];
        const origTerm = typeof orig === "string" ? orig : orig.term;
        return { ...item, term: origTerm };
      });
    }

    const termMap = new Map<string, GeneratedFlashcardItem>();
    for (const item of response.flashcards) {
      termMap.set(normalizeTerm(item.term), item);
    }

    return Promise.all(
      terms.map(async (item) => {
        const term = typeof item === "string" ? item : item.term;
        const normalized = normalizeTerm(term);
        const match = termMap.get(normalized);
        if (match) {
          return { ...match, term };
        }
        return await this.generateSingleFallback(term);
      })
    );
  }


  /**
   * Generates a coherent, engaging short story incorporating selected target vocabulary.
   */
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
    if (!targetWords || targetWords.length === 0) {
      throw new Error("At least one target word is required to generate a story.");
    }

    const prompt = buildStoryPrompt({ targetWords, cefr, length, topic });

    return this.callGeminiStructured<AIStoryResponse>({
      prompt,
      schema: aiStoryResponseSchema,
      temperature: 0.7,
      maxRetries: 2,
      fallback: () => this.generateFallbackStory(targetWords, cefr, length, topic),
    });
  }

  /**
   * Translates a selected word or phrase in its exact context inside the story.
   */
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
    const trimmedSurfaceForm = selectedText.trim();
    const trimmedCanonicalTerm = canonicalTerm?.trim() || trimmedSurfaceForm;
    if (!trimmedSurfaceForm || !trimmedCanonicalTerm) {
      throw new Error("Selected word is empty.");
    }

    const prompt = `You are an expert bilingual English-Vietnamese translator and vocabulary instructor.
Translate and explain the selected word or phrase within the exact context of the provided sentence.

Canonical vocabulary term: "${trimmedCanonicalTerm}"
Exact surface form in the story: "${trimmedSurfaceForm}"
Surrounding Sentence: "${surroundingSentence}"
Context Paragraph: "${context}"

Instructions:
1. Use the canonical vocabulary term as the dictionary identity. Provide 'meaningVi': Concise primary Vietnamese translation of this word or phrase in standard dictionary usage (MUST be entirely in natural Vietnamese, e.g. "lưỡng lự, miễn cưỡng").
2. Provide 'contextualMeaningVi': Accurate Vietnamese meaning of this term within this exact sentence context (MUST be in natural Vietnamese, NEVER repeat the English word).
3. Provide 'definitionVi': Clear, informative dictionary explanation or definition in Vietnamese explaining the concept, nuance, or usage (MUST be entirely in natural Vietnamese, NEVER in English).
4. Provide 'ipa': Phonetic pronunciation (IPA).
5. Provide 'partOfSpeech': Part of speech in this sentence (noun, verb, adjective, phrase, phrasal verb, etc.).
6. Provide 'definitionEn': Concise English definition matching the context.
7. Set 'exampleEn': The surrounding sentence itself.
8. Provide 'exampleVi': Accurate, natural Vietnamese translation of the entire surrounding sentence (MUST be in natural Vietnamese, NEVER in English).
9. Set 'cefr': Estimated CEFR level (A1, A2, B1, B2, C1, C2).

You MUST respond strictly with a valid JSON object matching this schema:
{
  "selectedText": "${trimmedCanonicalTerm}",
  "meaningVi": "string in Vietnamese",
  "contextualMeaningVi": "string in Vietnamese",
  "definitionVi": "string in Vietnamese",
  "ipa": "string or null",
  "partOfSpeech": "string or null",
  "definitionEn": "string in English",
  "exampleEn": "string in English",
  "exampleVi": "string in Vietnamese",
  "cefr": "string or null"
}`;

    return this.callGeminiStructured<ContextualTranslationResponse>({
      prompt,
      schema: contextualTranslationResponseSchema,
      temperature: 0.2,
      maxRetries: 2,
      fallback: () =>
        this.generateFallbackContextualTranslation(
          trimmedCanonicalTerm,
          surroundingSentence
        ),
    });
  }

  private async generateSingleFallback(term: string): Promise<GeneratedFlashcardItem> {
    const normalized = normalizeTerm(term);
    const curated = CURATED_DICTIONARY[normalized];
    if (curated) {
      const visualScore = curated.visualScore ?? (curated.imageUseful ? 85 : 0);
      return {
        term,
        ...curated,
        visualScore,
        imageUseful: visualScore >= AUTO_IMAGE_MIN_SCORE,
      };
    }

    const [meaningVi, dictionaryEntry] = await Promise.all([
      this.translateOnline(term),
      this.lookupPublicDictionaryEntry(term),
    ]);
    if (!meaningVi || !dictionaryEntry) {
      throw new AIError(
        `Không thể tạo nội dung flashcard đáng tin cậy cho "${term}" khi dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại sau.`
      );
    }

    const translatedExample = dictionaryEntry.exampleEn
      ? await this.translateOnline(dictionaryEntry.exampleEn)
      : null;

    const visualScore = 0;

    return {
      term,
      meaningVi,
      definitionEn: dictionaryEntry.definitionEn,
      ipa: dictionaryEntry.ipa,
      partOfSpeech: dictionaryEntry.partOfSpeech || (term.includes(" ") ? "phrase" : "word"),
      cefr: "B1",
      exampleEn: dictionaryEntry.exampleEn || `The word "${term}" is used in English to mean ${dictionaryEntry.definitionEn}.`,
      exampleVi: translatedExample || `Từ "${term}" được dùng với nghĩa "${meaningVi}".`,
      visualScore,
      imageUseful: false,
      imageSearchQuery: null,
    };
  }

  private async generateFallbackFlashcards(
    terms: FlashcardGenerationInput[]
  ): Promise<GeneratedFlashcardItem[]> {
    return await Promise.all(
      terms.map((item) => {
        const term = typeof item === "string" ? item : item.term;
        return this.generateSingleFallback(term);
      })
    );
  }

  private async lookupPublicDictionaryEntry(term: string): Promise<PublicDictionaryEntry | null> {
    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (!response.ok) return null;

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) return null;

      for (const entry of payload) {
        if (!isRecord(entry)) continue;
        const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
        const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : [];
        const ipa =
          (typeof entry.phonetic === "string" && entry.phonetic.trim()) ||
          phonetics.find((item) => isRecord(item) && typeof item.text === "string" && item.text.trim())?.text ||
          null;

        for (const meaning of meanings) {
          if (!isRecord(meaning) || !Array.isArray(meaning.definitions)) continue;
          const definition = meaning.definitions.find(
            (item): item is Record<string, unknown> =>
              isRecord(item) && typeof item.definition === "string" && item.definition.trim().length > 0
          );
          if (!definition) continue;

          return {
            definitionEn: definition.definition as string,
            ipa,
            partOfSpeech: typeof meaning.partOfSpeech === "string" ? meaning.partOfSpeech : null,
            exampleEn: typeof definition.example === "string" && definition.example.trim() ? definition.example : null,
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private generateFallbackStory(
    targetWords: string[],
    cefr: StoryCefr,
    length: StoryLength,
    topic: StoryTopic
  ): AIStoryResponse {
    const title =
      topic === "IT"
        ? "The Midnight Code Release"
        : topic === "Travel"
        ? "A Journey Across the Mountains"
        : topic === "Mystery"
        ? "The Clue in the Old Library"
        : topic === "Fantasy"
        ? "The Whispering Forest"
        : "A Day of New Discoveries";

    const sentences = [
      `It was an ordinary morning when Maya started her daily routine, thinking about how to ${targetWords[0] || "improve"}.`,
      targetWords.length > 1
        ? `She knew she had to be ${targetWords[1]} in the face of sudden difficulties, rather than avoiding what lay ahead.`
        : "She prepared herself to stay calm and focus on the task ahead.",
      targetWords.length > 2
        ? `Her team reminded her to ${targetWords[2]} and lead by example.`
        : "Every small step counted toward reaching the final milestone.",
      targetWords.length > 3
        ? `Even though she was initially ${targetWords[3]} to make a major change, the advice proved invaluable.`
        : "With renewed determination, she stepped forward with full confidence.",
      `By the evening, Maya looked back at what had unfolded with deep satisfaction. Turning challenges into stories had always been her greatest strength.`,
    ];

    if (length === "long") {
      sentences.push(
        "Later that night, as the stars illuminated the quiet horizon, she reflected on every conversation. Knowledge gained through real experience remains etched in the mind forever."
      );
    }

    const content = sentences.join("\n\n");
    return {
      title,
      content,
      wordsUsed: targetWords,
      usage: targetWords.map((term) => ({ term, usedAs: term })),
      contextualTranslations: [],
    };
  }

  /**
   * Helper to translate English text (words, phrases, or sentences) to natural Vietnamese.
   * Uses online bilingual translation API with graceful fallback.
   */
  private async translateOnline(text: string): Promise<string | null> {
    if (!text || !text.trim()) return null;
    const trimmed = text.trim();
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        trimmed
      )}&langpair=en|vi`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const rawTranslated = json?.responseData?.translatedText;
      if (typeof rawTranslated === "string" && rawTranslated.trim()) {
        const decoded = rawTranslated
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
        // Check that translation didn't simply echo back the English input
        if (decoded.toLowerCase() !== trimmed.toLowerCase()) {
          return decoded;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async generateFallbackContextualTranslation(
    word: string,
    sentence: string
  ): Promise<ContextualTranslationResponse> {
    const normalized = normalizeTerm(word);
    const curated = CURATED_DICTIONARY[normalized];

    // Fetch translations online in parallel for both the target term and the full sentence
    const [onlineWordMeaning, onlineSentenceTranslation] = await Promise.all([
      curated ? Promise.resolve(curated.meaningVi) : this.translateOnline(word),
      this.translateOnline(sentence),
    ]);

    const meaningVi =
      curated?.meaningVi ||
      onlineWordMeaning ||
      `Từ vựng "${word}"`;

    const contextualMeaningVi =
      curated?.meaningVi ||
      onlineWordMeaning ||
      `Ý nghĩa ngữ cảnh của "${word}"`;

    // Ensure sentence translation is genuine Vietnamese, never the raw English sentence
    const exampleVi =
      onlineSentenceTranslation ||
      (curated?.exampleVi ? curated.exampleVi : (meaningVi ? `Câu sử dụng từ mang nghĩa "${meaningVi}".` : `Bản dịch cho câu chứa từ "${word}".`));

    const definitionVi =
      curated?.meaningVi
        ? `Định nghĩa từ điển: ${curated.meaningVi}.`
        : onlineWordMeaning
        ? `Định nghĩa từ điển: ${onlineWordMeaning}.`
        : `Giải nghĩa từ vựng: "${word}".`;

    const definitionEn =
      curated?.definitionEn ||
      `English vocabulary term: ${word}.`;

    return {
      selectedText: word,
      meaningVi,
      contextualMeaningVi,
      definitionVi,
      ipa: curated?.ipa || null,
      partOfSpeech:
        curated?.partOfSpeech || (word.includes(" ") ? "phrase" : "noun"),
      definitionEn,
      exampleEn: sentence,
      exampleVi,
      cefr: curated?.cefr || "B1",
    };
  }

}


export const aiService = new GeminiAIService();
