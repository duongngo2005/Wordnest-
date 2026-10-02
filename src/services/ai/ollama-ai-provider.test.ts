import { describe, expect, it, vi } from "vitest";
import { AIProviderUnavailableError, AITimeoutError } from "./ai-core";
import { OllamaAiProvider } from "./ollama-ai-provider";

describe("OllamaAiProvider", () => {
  it("sends a non-streaming JSON chat request to the configured local model", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      model: "wordnest-local",
      message: { role: "assistant", content: '{"value":"local"}' },
      done: true,
    }), { status: 200 }));
    const provider = new OllamaAiProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "wordnest-local",
      fetcher,
    });

    await expect(provider.generateJson({ prompt: "Return JSON", temperature: 0.2, timeoutMs: 5_000 }))
      .resolves.toBe('{"value":"local"}');

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "wordnest-local",
          messages: [{ role: "user", content: "Return JSON" }],
          format: "json",
          stream: false,
          options: { temperature: 0.2 },
        }),
      })
    );
  });

  it("returns a safe unavailable error when the local service cannot be reached", async () => {
    const provider = new OllamaAiProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "wordnest-local",
      fetcher: vi.fn(async () => {
        throw new TypeError("connect ECONNREFUSED");
      }),
    });

    await expect(provider.generateJson({ prompt: "Return JSON", temperature: 0.2, timeoutMs: 5_000 }))
      .rejects.toBeInstanceOf(AIProviderUnavailableError);
  });

  it("classifies an aborted local request as a timeout", async () => {
    const provider = new OllamaAiProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "wordnest-local",
      fetcher: vi.fn(async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }),
    });

    await expect(provider.generateJson({ prompt: "Return JSON", temperature: 0.2, timeoutMs: 5_000 }))
      .rejects.toBeInstanceOf(AITimeoutError);
  });
});
