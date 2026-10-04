import {
  AICancelledError,
  AIOomError,
  AIParseError,
  AIProviderUnavailableError,
  AITimeoutError,
} from "./ai-core";

type OllamaAiProviderOptions = {
  baseUrl: string;
  model: string;
  fetcher?: typeof fetch;
};

export type OllamaJsonRequest = {
  systemPrompt?: string;
  prompt: string;
  temperature?: number;
  topP?: number;
  numCtx?: number;
  numPredict?: number;
  think?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type OllamaChatResponse = {
  message?: {
    content?: unknown;
  };
};

/**
 * Process-level FIFO mutex to serialize all calls to local Ollama.
 * Protects single GPU (e.g. RTX 4050 6GB) with OLLAMA_NUM_PARALLEL=1 from concurrent request collisions.
 */
export class OllamaExecutionGate {
  private queue: Array<() => void> = [];
  private locked = false;

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

export const sharedOllamaExecutionGate = new OllamaExecutionGate();

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

  async generateJson(request: OllamaJsonRequest): Promise<string> {
    return sharedOllamaExecutionGate.runExclusive(() => this.executeGenerateJson(request));
  }

  private async executeGenerateJson({
    systemPrompt,
    prompt,
    temperature = 0.2,
    topP,
    numCtx,
    numPredict,
    think,
    timeoutMs,
    signal,
  }: OllamaJsonRequest): Promise<string> {
    let response: Response;

    const messages = systemPrompt
      ? [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ]
      : [{ role: "user", content: prompt }];

    const options: Record<string, unknown> = { temperature };
    if (typeof topP === "number") options.top_p = topP;
    if (typeof numCtx === "number") options.num_ctx = numCtx;
    if (typeof numPredict === "number") options.num_predict = numPredict;

    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages,
      format: "json",
      stream: false,
      options,
    };
    if (think !== undefined) {
      requestBody.think = think;
    }

    const abortSignals: AbortSignal[] = [];
    if (timeoutMs) {
      abortSignals.push(AbortSignal.timeout(timeoutMs));
    }
    if (signal) {
      abortSignals.push(signal);
    }
    const combinedSignal =
      abortSignals.length > 1
        ? AbortSignal.any(abortSignals)
        : abortSignals[0];

    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: combinedSignal,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new AICancelledError();
      }
      if (isTimeoutError(error)) {
        throw new AITimeoutError(`Ollama request timed out${timeoutMs ? ` after ${timeoutMs}ms` : ""}`);
      }
      throw new AIProviderUnavailableError(undefined, error);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      if (/out of memory|cuda/i.test(errText)) {
        throw new AIOomError();
      }
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
