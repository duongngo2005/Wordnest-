import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AIInvalidResponseError } from "./ai-core";
import { OllamaAIService } from "./ai-service";

describe("OllamaAIService", () => {
  it("uses the configured local Ollama endpoint for structured generation", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: { content: '{"value":"local"}' },
    }), { status: 200 }));
    const service = new OllamaAIService({
      baseUrl: "http://127.0.0.1:11434",
      model: "wordnest-local",
      fetcher,
    });

    await expect(service.callStructured({
      prompt: "Return JSON",
      schema: z.object({ value: z.string() }),
    })).resolves.toEqual({ value: "local" });

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/chat",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("retries malformed local output once before returning an invalid-response error", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: { content: "not-json" },
    }), { status: 200 }));
    const service = new OllamaAIService({ fetcher });

    await expect(service.callStructured({
      prompt: "Return JSON",
      schema: z.object({ value: z.string() }),
    })).rejects.toBeInstanceOf(AIInvalidResponseError);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

});
