import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeminiAIService, isAllowedOpenRouterModel } from "./ai-service";
import { z } from "zod";

const openRouterModels = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openrouter/free",
] as const;

function openRouterJsonResponse(content: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("GeminiAIService Key Rotation and Failover", () => {
  const originalFetch = global.fetch;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
  });

  it("uses only dedicated Gemma models for structured fallback after Gemini quota is exhausted", async () => {
    process.env.OPENROUTER_API_KEY = "OPENROUTER_TEST_KEY";
    const service = new GeminiAIService(["GEMINI_RATE_LIMITED"]);
    const requestedModels: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }), {
          status: 429,
        });
      }

      const payload = JSON.parse(String(init?.body));
      requestedModels.push(payload.model);
      return new Response("Model temporarily unavailable", { status: 503 });
    }) as unknown as typeof fetch;

    await expect(
      service.callGeminiStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        maxRetries: 0,
      })
    ).rejects.toThrow("Dịch vụ AI đang tạm thời không khả dụng");

    expect(requestedModels).toEqual(openRouterModels.slice(0, 2));
    expect(requestedModels.every((model) => openRouterModels.includes(model as typeof openRouterModels[number]))).toBe(true);
  });

  it("logs safe HTTP diagnostics for a failed OpenRouter model request", async () => {
    const service = new GeminiAIService([], undefined, "OPENROUTER_TEST_KEY");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 429, message: "Provider returned error" } }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    )) as unknown as typeof fetch;

    await expect(
      (service as unknown as {
        callOpenRouterStructured: (options: {
          prompt: string;
          schema: z.ZodType<{ value: string }>;
          temperature: number;
          timeoutMs: number;
          reason: string;
        }) => Promise<{ value: string }>;
      }).callOpenRouterStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        temperature: 0.2,
        timeoutMs: 1_000,
        reason: "timeout",
      })
    ).rejects.toThrow("Dịch vụ AI đang tạm thời không khả dụng");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("http_status=429"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("error_code=429"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("error_message=Provider returned error"));
    expect(warn.mock.calls.flat().join(" ")).not.toContain("OPENROUTER_TEST_KEY");
  });

  it("uses Gemma 4 31B as the first fallback after a Gemini HTTP 429", async () => {
    const service = new GeminiAIService(["GEMINI_RATE_LIMITED"], undefined, "OPENROUTER_TEST_KEY");
    const requestedModels: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes("generativelanguage.googleapis.com")) {
        return new Response("quota exhausted", { status: 429 });
      }

      const payload = JSON.parse(String(init?.body));
      requestedModels.push(payload.model);
      return openRouterJsonResponse({ value: "from-gemma-31b" });
    }) as unknown as typeof fetch;

    await expect(
      service.callGeminiStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        maxRetries: 0,
      })
    ).resolves.toEqual({ value: "from-gemma-31b" });

    expect(requestedModels).toEqual(["google/gemma-4-31b-it:free"]);
  });

  it("blocks models outside the OpenRouter free-model allowlist", () => {
    expect(isAllowedOpenRouterModel("openai/gpt-4o")).toBe(false);
    expect(isAllowedOpenRouterModel("google/gemma-4-31b-it:free")).toBe(true);
  });

  it("blocks a disallowed model before it can send an OpenRouter request", async () => {
    const service = new GeminiAIService([], undefined, "OPENROUTER_TEST_KEY");
    const callOpenRouterModel = (service as unknown as {
      callOpenRouterModel: (
        model: string,
        prompt: string,
        temperature: number,
        timeoutMs: number
      ) => Promise<string>;
    }).callOpenRouterModel;
    global.fetch = vi.fn();

    await expect(
      callOpenRouterModel.call(service, "openai/gpt-4o", "test", 0.2, 1_000)
    ).rejects.toThrow("Blocked OpenRouter model outside the allowlist");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses the same OpenRouter fallback for flashcards, stories, and contextual translation", async () => {
    process.env.OPENROUTER_API_KEY = "OPENROUTER_TEST_KEY";
    const service = new GeminiAIService(["GEMINI_UNAVAILABLE"]);
    const requestedModels: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (url.toString().includes("generativelanguage.googleapis.com")) {
        return new Response("Gemini unavailable", { status: 503 });
      }

      const payload = JSON.parse(String(init?.body));
      requestedModels.push(payload.model);
      const prompt = payload.messages[0].content as string;

      if (prompt.includes("Generate comprehensive flashcard")) {
        return openRouterJsonResponse({
          flashcards: [{
            term: "reliable",
            meaningVi: "đáng tin cậy",
            definitionEn: "able to be trusted",
            ipa: null,
            partOfSpeech: "adjective",
            cefr: "B1",
            exampleEn: "This is a reliable source.",
            exampleVi: "Đây là một nguồn đáng tin cậy.",
            imageUseful: false,
            imageSearchQuery: null,
          }],
        });
      }

      if (prompt.includes("talented author")) {
        return openRouterJsonResponse({
          title: "A Reliable Plan",
          content: "Lan made a reliable plan for the week.",
          wordsUsed: ["reliable"],
        });
      }

      if (prompt.includes("bilingual English-Vietnamese translator")) {
        return openRouterJsonResponse({
          selectedText: "reliable",
          meaningVi: "đáng tin cậy",
          contextualMeaningVi: "đáng tin cậy trong ngữ cảnh này",
          definitionVi: "Có thể được tin tưởng.",
          ipa: "/rɪˈlaɪəbl/",
          partOfSpeech: "adjective",
          definitionEn: "able to be trusted",
          exampleEn: "This is a reliable source.",
          exampleVi: "Đây là một nguồn đáng tin cậy.",
          cefr: "B1",
        });
      }

      throw new Error("Unexpected AI prompt in fallback test");
    }) as unknown as typeof fetch;

    await expect(service.generateFlashcards(["reliable"])).resolves.toHaveLength(1);
    await expect(service.generateStory({ targetWords: ["reliable"] })).resolves.toMatchObject({
      title: "A Reliable Plan",
    });
    await expect(
      service.translateInContext({
        selectedText: "reliable",
        surroundingSentence: "This is a reliable source.",
      })
    ).resolves.toMatchObject({ meaningVi: "đáng tin cậy" });
    expect(requestedModels).toEqual(Array(3).fill("google/gemma-4-31b-it:free"));
  });

  it("retries a malformed OpenRouter JSON response once before accepting schema-valid output", async () => {
    process.env.OPENROUTER_API_KEY = "OPENROUTER_TEST_KEY";
    const service = new GeminiAIService(["GEMINI_UNAVAILABLE"]);
    let openRouterCalls = 0;

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      if (url.toString().includes("generativelanguage.googleapis.com")) {
        return new Response("Gemini unavailable", { status: 503 });
      }

      openRouterCalls++;
      if (openRouterCalls === 1) {
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "not-json" } }] }),
          { status: 200 }
        );
      }
      return openRouterJsonResponse({ value: "recovered" });
    }) as unknown as typeof fetch;

    const result = await service.callGeminiStructured({
      prompt: "Return structured JSON",
      schema: z.object({ value: z.string() }),
      maxRetries: 0,
    });

    expect(result).toEqual({ value: "recovered" });
    expect(openRouterCalls).toBe(2);
  });

  it("rejects malformed OpenRouter JSON after one retry without advancing the fallback chain", async () => {
    const service = new GeminiAIService(["GEMINI_UNAVAILABLE"], undefined, "OPENROUTER_TEST_KEY");
    let openRouterCalls = 0;

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      if (url.toString().includes("generativelanguage.googleapis.com")) {
        return new Response("Gemini unavailable", { status: 503 });
      }

      openRouterCalls++;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "not-json" } }] }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    await expect(
      service.callGeminiStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        maxRetries: 0,
      })
    ).rejects.toThrow("Dịch vụ AI trả về dữ liệu không hợp lệ");

    expect(openRouterCalls).toBe(2);
  });

  it("does not call OpenRouter when Gemini returns schema-valid JSON", async () => {
    process.env.OPENROUTER_API_KEY = "OPENROUTER_TEST_KEY";
    const service = new GeminiAIService(["GEMINI_HEALTHY"]);
    const requestedUrls: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      requestedUrls.push(url.toString());
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ value: "from-gemini" }) }] } }],
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const result = await service.callGeminiStructured({
      prompt: "Return structured JSON",
      schema: z.object({ value: z.string() }),
      maxRetries: 0,
    });

    expect(result).toEqual({ value: "from-gemini" });
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain("generativelanguage.googleapis.com");
  });

  it("does not fall back for a Gemini HTTP 400, even when its payload says unavailable", async () => {
    const service = new GeminiAIService(["GEMINI_BAD_REQUEST"], undefined, "OPENROUTER_TEST_KEY");
    const requestedUrls: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      requestedUrls.push(url.toString());
      if (url.toString().includes("generativelanguage.googleapis.com")) {
        return new Response("provider unavailable because the request is invalid", { status: 400 });
      }
      return openRouterJsonResponse({ value: "must-not-be-used" });
    }) as unknown as typeof fetch;

    await expect(
      service.callGeminiStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        maxRetries: 0,
      })
    ).rejects.toThrow("Gemini API HTTP 400");

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain("generativelanguage.googleapis.com");
  });

  it("does not fall back for a Gemini HTTP 500", async () => {
    const service = new GeminiAIService(["GEMINI_INTERNAL_ERROR"], undefined, "OPENROUTER_TEST_KEY");
    const requestedUrls: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      requestedUrls.push(url.toString());
      return new Response("internal error", { status: 500 });
    }) as unknown as typeof fetch;

    await expect(
      service.callGeminiStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        maxRetries: 0,
      })
    ).rejects.toThrow("Gemini API HTTP 500");

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain("generativelanguage.googleapis.com");
  });

  it("does not use OpenRouter when Gemini is not configured", async () => {
    const service = new GeminiAIService([], undefined, "OPENROUTER_TEST_KEY");

    global.fetch = vi.fn(async () => openRouterJsonResponse({ value: "must-not-be-used" })) as unknown as typeof fetch;

    await expect(
      service.callGeminiStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        maxRetries: 0,
      })
    ).rejects.toThrow("No Gemini API keys configured");

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns a friendly provider error after every allowed OpenRouter model fails", async () => {
    process.env.OPENROUTER_API_KEY = "OPENROUTER_TEST_KEY";
    const service = new GeminiAIService(["GEMINI_UNAVAILABLE"]);

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      if (url.toString().includes("generativelanguage.googleapis.com")) {
        return new Response("Gemini unavailable", { status: 503 });
      }
      return new Response("OpenRouter unavailable", { status: 503 });
    }) as unknown as typeof fetch;

    await expect(
      service.callGeminiStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        maxRetries: 0,
      })
    ).rejects.toThrow("Dịch vụ AI đang tạm thời không khả dụng");
  });

  it("parses multiple API keys from string or array correctly", () => {
    const service1 = new GeminiAIService("KEY_A,KEY_B, KEY_C");
    expect(service1.hasKeys).toBe(true);

    const service2 = new GeminiAIService(["KEY_1", "KEY_2"]);
    expect(service2.hasKeys).toBe(true);

    const service3 = new GeminiAIService("");
    expect(service3.hasKeys).toBe(false);
  });

  it("rotates to next key when the first key encounters HTTP 429", async () => {
    const keys = ["KEY_FAIL_429", "KEY_SUCCESS"];
    const service = new GeminiAIService(keys);

    let callCount = 0;
    const requestedKeys: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      callCount++;
      const urlStr = url.toString();
      const keyParam = new URL(urlStr).searchParams.get("key") || "";
      requestedKeys.push(keyParam);

      if (keyParam === "KEY_FAIL_429") {
        return new Response(
          JSON.stringify({
            error: {
              code: 429,
              status: "RESOURCE_EXHAUSTED",
              message: "Quota exceeded",
              details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "45s" }],
            },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      flashcards: [
                        {
                          term: "resilient",
                          meaningVi: "kiên cường",
                          definitionEn: "able to recover quickly",
                          ipa: "/rɪˈzɪljənt/",
                          partOfSpeech: "adjective",
                          cefr: "B2",
                          exampleEn: "She is resilient.",
                          exampleVi: "Cô ấy kiên cường.",
                          imageUseful: true,
                          imageSearchQuery: "resilience",
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const result = await service.generateFlashcards(["resilient"]);

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("resilient");
    expect(result[0].meaningVi).toBe("kiên cường");
    // Verify that the first request was with KEY_FAIL_429 and subsequent rotated to KEY_SUCCESS
    expect(callCount).toBe(2);
    expect(requestedKeys[0]).toBe("KEY_FAIL_429");
    expect(requestedKeys[1]).toBe("KEY_SUCCESS");
  });

  it("tries the next Gemini key after a timeout before falling back", async () => {
    const service = new GeminiAIService(
      ["KEY_TIMED_OUT", "KEY_HEALTHY"],
      undefined,
      "OPENROUTER_TEST_KEY"
    );
    const requestedKeys: string[] = [];
    const requestedUrls: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlString = url.toString();
      requestedUrls.push(urlString);

      if (!urlString.includes("generativelanguage.googleapis.com")) {
        return openRouterJsonResponse({ value: "should-not-be-used" });
      }

      const key = new URL(urlString).searchParams.get("key") || "";
      requestedKeys.push(key);
      if (key === "KEY_TIMED_OUT") {
        const timeout = new Error("request timed out");
        timeout.name = "TimeoutError";
        throw timeout;
      }

      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ value: "from-healthy-key" }) }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    await expect(
      service.callGeminiStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        maxRetries: 0,
      })
    ).resolves.toEqual({ value: "from-healthy-key" });

    expect(requestedKeys).toEqual(["KEY_TIMED_OUT", "KEY_HEALTHY"]);
    expect(requestedUrls.every((url) => url.includes("generativelanguage.googleapis.com"))).toBe(true);
  });

  it("tries the next Gemini key after an HTTP 503", async () => {
    const service = new GeminiAIService(
      ["KEY_503", "KEY_HEALTHY"],
      undefined,
      "OPENROUTER_TEST_KEY"
    );
    const requestedKeys: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlString = url.toString();
      if (!urlString.includes("generativelanguage.googleapis.com")) {
        return openRouterJsonResponse({ value: "should-not-be-used" });
      }

      const key = new URL(urlString).searchParams.get("key") || "";
      requestedKeys.push(key);
      if (key === "KEY_503") {
        return new Response("Gemini temporarily unavailable", { status: 503 });
      }

      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ value: "from-healthy-key" }) }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    await expect(
      service.callGeminiStructured({
        prompt: "Return structured JSON",
        schema: z.object({ value: z.string() }),
        maxRetries: 0,
      })
    ).resolves.toEqual({ value: "from-healthy-key" });

    expect(requestedKeys).toEqual(["KEY_503", "KEY_HEALTHY"]);
  });

  it("allows a large flashcard batch to finish after the default 15-second timeout", async () => {
    const service = new GeminiAIService(["SLOW_BUT_HEALTHY_KEY"]);
    const terms = [
      "attract",
      "compare",
      "compete",
      "consume",
      "convince",
      "current",
      "fad",
      "inspire",
      "market",
      "persuade",
      "productive",
      "satisfy",
    ];

    global.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      if (!url.toString().includes("generativelanguage.googleapis.com")) {
        return Promise.resolve(new Response("fallback must not be used", { status: 500 }));
      }

      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve(
            new Response(
              JSON.stringify({
                candidates: [{
                  content: {
                    parts: [{
                      text: JSON.stringify({
                        flashcards: terms.map((term) => ({
                          term,
                          meaningVi: `nghĩa của ${term}`,
                          definitionEn: `definition of ${term}`,
                          ipa: null,
                          partOfSpeech: "verb",
                          cefr: "B1",
                          exampleEn: `We use ${term} in a sentence.`,
                          exampleVi: `Chúng tôi dùng ${term} trong một câu.`,
                          imageUseful: false,
                          imageSearchQuery: null,
                        })),
                      }),
                    }],
                  },
                }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }, 16_000);

        const onAbort = () => {
          clearTimeout(timer);
          const timeout = new Error("request timed out");
          timeout.name = "TimeoutError";
          reject(timeout);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }) as unknown as typeof fetch;

    await expect(service.generateFlashcards(terms)).resolves.toHaveLength(terms.length);
  }, 35_000);

  it("subsequent requests skip the cooling-down key and use the healthy key", async () => {
    const keys = ["KEY_RATE_LIMITED", "KEY_HEALTHY"];
    const service = new GeminiAIService(keys);

    const requestedKeys: string[] = [];

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      const keyParam = new URL(urlStr).searchParams.get("key") || "";
      requestedKeys.push(keyParam);

      if (keyParam === "KEY_RATE_LIMITED") {
        return new Response(
          JSON.stringify({
            error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Limit reached" },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Success Story",
                      content: "Paragraph 1\n\nParagraph 2",
                      wordsUsed: ["courage"],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    // Call 1: triggers rotation from KEY_RATE_LIMITED to KEY_HEALTHY
    await service.generateStory({ targetWords: ["courage"] });
    expect(requestedKeys).toEqual(["KEY_RATE_LIMITED", "KEY_HEALTHY"]);

    // Call 2: since KEY_RATE_LIMITED is now cooling down, it should directly use KEY_HEALTHY
    requestedKeys.length = 0;
    await service.generateStory({ targetWords: ["courage"] });
    expect(requestedKeys).toEqual(["KEY_HEALTHY"]);
  });

  it("gracefully falls back to offline dictionary if all keys are exhausted", async () => {
    const service = new GeminiAIService(["KEY_EXHAUSTED"]);

    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Daily quota reached" },
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    // Apple is in CURATED_DICTIONARY
    const cards = await service.generateFlashcards(["apple"]);
    expect(cards).toHaveLength(1);
    expect(cards[0].term).toBe("apple");
    expect(cards[0].meaningVi).toContain("táo");
  });

  it("returns a real Vietnamese card for party when Gemini is unavailable", async () => {
    const service = new GeminiAIService([]);

    const [card] = await service.generateFlashcards(["party"]);

    expect(card).toMatchObject({
      term: "party",
      meaningVi: "bữa tiệc; buổi liên hoan",
      definitionEn: "a social gathering of people who come together to celebrate or have fun",
      exampleEn: "We are having a party for Lan's birthday on Saturday.",
      exampleVi: "Chúng tôi sẽ tổ chức tiệc sinh nhật cho Lan vào thứ Bảy.",
    });
    expect(card.meaningVi).not.toContain("Ý nghĩa của");
  });

  it("refuses to create placeholder flashcards when every fallback source is unavailable", async () => {
    const service = new GeminiAIService([]);
    global.fetch = vi.fn(async () => new Response("Service unavailable", { status: 503 })) as unknown as typeof fetch;

    await expect(service.generateFlashcards(["unavailable-word"])).rejects.toThrow(
      "Không thể tạo nội dung flashcard đáng tin cậy"
    );
  });

  it("uses verified dictionary and translation results for an uncached term", async () => {
    const service = new GeminiAIService([]);

    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = url.toString();
      if (requestUrl.startsWith("https://api.dictionaryapi.dev/")) {
        return new Response(
          JSON.stringify([
            {
              phonetic: "/rɪˈlaɪəbl/",
              meanings: [
                {
                  partOfSpeech: "adjective",
                  definitions: [
                    {
                      definition: "able to be trusted to do what is expected or promised",
                      example: "This is a reliable source of information.",
                    },
                  ],
                },
              ],
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (requestUrl.includes("api.mymemory.translated.net")) {
        const input = new URL(requestUrl).searchParams.get("q");
        const translatedText =
          input === "reliable"
            ? "đáng tin cậy"
            : "Đây là một nguồn thông tin đáng tin cậy.";
        return new Response(
          JSON.stringify({ responseData: { translatedText } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Unexpected fallback request: ${requestUrl}`);
    }) as unknown as typeof fetch;

    const [card] = await service.generateFlashcards(["reliable"]);

    expect(card).toMatchObject({
      term: "reliable",
      meaningVi: "đáng tin cậy",
      definitionEn: "able to be trusted to do what is expected or promised",
      exampleEn: "This is a reliable source of information.",
      exampleVi: "Đây là một nguồn thông tin đáng tin cậy.",
    });
    expect(card.exampleVi).not.toContain("Chúng ta có thể dùng");
  });
});
