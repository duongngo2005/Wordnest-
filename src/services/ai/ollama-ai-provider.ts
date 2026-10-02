import {
  AIParseError,
  AIProviderUnavailableError,
  AITimeoutError,
} from "./ai-core";

type OllamaAiProviderOptions = {
  baseUrl: string;
  model: string;
  fetcher?: typeof fetch;
};

type OllamaJsonRequest = {
  prompt: string;
  temperature: number;
  timeoutMs: number;
};

type OllamaChatResponse = {
  message?: {
    content?: unknown;
  };
};

/** Minimal server-side client for Ollama's non-streaming JSON chat endpoint. */
export class OllamaAiProvider {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor({ baseUrl, model, fetcher = fetch }: OllamaAiProviderOptions) {
    this.endpoint = getOllamaChatEndpoint(baseUrl);
    this.model = model.trim();
    this.fetcher = fetcher;
  }

  async generateJson({ prompt, temperature, timeoutMs }: OllamaJsonRequest): Promise<string> {
    let response: Response;

    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          format: "json",
          stream: false,
          options: { temperature },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new AITimeoutError(`Ollama request timed out after ${timeoutMs}ms`);
      }
      throw new AIProviderUnavailableError(undefined, error);
    }

    if (!response.ok) {
      throw new AIProviderUnavailableError(`Ollama returned HTTP ${response.status}`);
    }

    const payload = await parseOllamaResponse(response);
    const content = payload.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new AIParseError("Ollama returned an empty chat message", "");
    }

    return content;
  }
}

async function parseOllamaResponse(response: Response): Promise<OllamaChatResponse> {
  try {
    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      throw new AIParseError("Invalid JSON envelope from Ollama", JSON.stringify(payload));
    }
    return payload as OllamaChatResponse;
  } catch (error) {
    if (error instanceof AIParseError) throw error;
    throw new AIParseError(
      "Invalid JSON envelope from Ollama",
      error instanceof Error ? error.message : String(error)
    );
  }
}

function getOllamaChatEndpoint(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    throw new AIProviderUnavailableError("Ollama is not configured");
  }

  try {
    return new URL("/api/chat", `${normalizedBaseUrl}/`).toString();
  } catch (error) {
    throw new AIProviderUnavailableError("Ollama URL is invalid", error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}
