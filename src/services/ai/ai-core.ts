import { ZodSchema } from "zod";

/**
 * Custom error hierarchy for AI operations.
 */
export class AIError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "AIError";
  }
}

export class AIRateLimitError extends AIError {
  constructor(message: string, public readonly retryAfterSeconds = 60) {
    super(message);
    this.name = "AIRateLimitError";
  }
}

/** The provider has exhausted its available quota, rather than a short request burst. */
export class AIQuotaExceededError extends AIError {
  constructor(message = "AI provider quota exhausted.", public readonly retryAfterSeconds = 60) {
    super(message);
    this.name = "AIQuotaExceededError";
  }
}

export class AITimeoutError extends AIError {
  constructor(message: string) {
    super(message);
    this.name = "AITimeoutError";
  }
}

export class AIParseError extends AIError {
  constructor(message: string, public readonly rawText: string) {
    super(message);
    this.name = "AIParseError";
  }
}

export class AIValidationError extends AIError {
  constructor(message: string, public readonly issues: unknown) {
    super(message);
    this.name = "AIValidationError";
  }
}

export class AINoKeysConfiguredError extends AIError {
  constructor(message = "No Gemini API keys configured.") {
    super(message);
    this.name = "AINoKeysConfiguredError";
  }
}

/**
 * Safe, user-facing failure after every configured AI provider is temporarily unavailable.
 */
export class AIProviderUnavailableError extends AIError {
  constructor(
    message = "Dịch vụ AI đang tạm thời không khả dụng. Vui lòng thử lại sau.",
    originalError?: unknown
  ) {
    super(message, originalError);
    this.name = "AIProviderUnavailableError";
  }
}

/**
 * Safe, user-facing failure for AI output that cannot be parsed or validated.
 */
export class AIInvalidResponseError extends AIError {
  constructor(
    message = "Dịch vụ AI trả về dữ liệu không hợp lệ. Vui lòng thử lại sau.",
    originalError?: unknown
  ) {
    super(message, originalError);
    this.name = "AIInvalidResponseError";
  }
}

/**
 * Robust JSON extraction and parsing utility.
 * Strips markdown code fences, handles trailing commas, and extracts valid JSON blocks.
 */
function removeTrailingCommasOutsideStrings(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(input[nextIndex] || "")) nextIndex++;
      if (input[nextIndex] === "}" || input[nextIndex] === "]") {
        continue;
      }
    }

    output += char;
  }

  return output;
}

/**
 * Normalizes common LLM JSON wrappers before JSON.parse and Zod validation.
 */
export function sanitizeJsonText(raw: string): string {
  let cleaned = raw.trim();

  // 1. Strip markdown code fences like ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/, "");
  cleaned = cleaned.trim();

  // 2. If the response has surrounding conversation, locate the first '{' or '[' and matching closing
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");

  let startIndex = -1;
  let isArray = false;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIndex = firstBrace;
    isArray = false;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
    isArray = true;
  }

  if (startIndex !== -1) {
    const endChar = isArray ? "]" : "}";
    const endIndex = cleaned.lastIndexOf(endChar);
    if (endIndex !== -1 && endIndex >= startIndex) {
      cleaned = cleaned.substring(startIndex, endIndex + 1);
    }
  }

  // 3. Strip trailing commas without mutating text inside quoted JSON strings.
  return removeTrailingCommasOutsideStrings(cleaned);
}

export function cleanAndParseJson<T = unknown>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new AIParseError("Empty or non-string response received from AI", String(raw));
  }

  const cleaned = sanitizeJsonText(raw);

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new AIParseError(
      `Failed to parse JSON from AI response: ${err instanceof Error ? err.message : String(err)}`,
      raw
    );
  }
}

/**
 * Options for executing an AI request with retry, backoff, and validation.
 */
export interface AIExecutionOptions<T> {
  prompt: string;
  schema?: ZodSchema<T>;
  maxRetries?: number;
  timeoutMs?: number;
  temperature?: number;
  fallback?: () => Promise<T> | T;
}
