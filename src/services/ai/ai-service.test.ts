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

  it("batches flashcard generation into chunks of 10 and preserves exact ordering", async () => {
    const terms = Array.from({ length: 15 }, (_, i) => `word${i + 1}`);
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      const promptText = body.messages[1].content;
      // Determine which words are requested in this batch
      const requestedWords = terms.filter((w) => promptText.includes(w));
      const flashcards = requestedWords.map((w) => ({
        term: w,
        meaningVi: `nghĩa của ${w}`,
        definitionEn: `definition of ${w}`,
        ipa: "/test/",
        partOfSpeech: "noun",
        cefr: "B1",
        exampleEn: `This is an example sentence for ${w}.`,
        exampleVi: `Đây là câu ví dụ cho ${w}.`,
        visualScore: 80,
      }));
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({ flashcards }),
          },
        }),
        { status: 200 }
      );
    });

    const service = new OllamaAIService({ fetcher });
    const result = await service.generateFlashcards(terms);

    expect(fetcher).toHaveBeenCalledTimes(2); // Batch 1 (10 words) + Batch 2 (5 words)
    expect(result).toHaveLength(15);
    expect(result.map((c) => c.term)).toEqual(terms);
  });

  it("performs targeted retry when a batch returns missing or invalid flashcards", async () => {
    const terms = ["word1", "word2"];
    let callCount = 0;
    const fetcher = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        // Return only word1
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                flashcards: [
                  {
                    term: "word1",
                    meaningVi: "nghĩa 1",
                    definitionEn: "def 1",
                    ipa: "/w1/",
                    partOfSpeech: "noun",
                    cefr: "A1",
                    exampleEn: "Example for word1.",
                    exampleVi: "Ví dụ 1.",
                    visualScore: 80,
                  },
                ],
              }),
            },
          }),
          { status: 200 }
        );
      }
      // Retry call for word2
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              flashcards: [
                {
                  term: "word2",
                  meaningVi: "nghĩa 2",
                  definitionEn: "def 2",
                  ipa: "/w2/",
                  partOfSpeech: "noun",
                  cefr: "A1",
                  exampleEn: "Example for word2.",
                  exampleVi: "Ví dụ 2.",
                  visualScore: 80,
                },
              ],
            }),
          },
        }),
        { status: 200 }
      );
    });

    const service = new OllamaAIService({ fetcher });
    const result = await service.generateFlashcards(terms);

    expect(callCount).toBe(2); // 1 initial batch + 1 targeted retry
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.term)).toEqual(["word1", "word2"]);
  });
});
