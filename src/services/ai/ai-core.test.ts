import { describe, it, expect, vi } from "vitest";
import {
  cleanAndParseJson,
  AIParseError,
} from "./ai-core";
import { GeminiAIService } from "./ai-service";
import { z } from "zod";

describe("AI Core Robust Parsing and Error Handling", () => {
  describe("cleanAndParseJson", () => {
    it("parses pure JSON string directly", () => {
      const input = '{"name": "WordNest", "count": 10}';
      const output = cleanAndParseJson<{ name: string; count: number }>(input);
      expect(output.name).toBe("WordNest");
      expect(output.count).toBe(10);
    });

    it("strips ```json ... ``` code fences from LLM responses", () => {
      const input = '```json\n{"term": "diligent", "meaning": "chăm chỉ"}\n```';
      const output = cleanAndParseJson<{ term: string; meaning: string }>(input);
      expect(output.term).toBe("diligent");
      expect(output.meaning).toBe("chăm chỉ");
    });

    it("strips generic ``` ... ``` code fences", () => {
      const input = '```\n[{"term": "lucid"}]\n```';
      const output = cleanAndParseJson<Array<{ term: string }>>(input);
      expect(output).toHaveLength(1);
      expect(output[0].term).toBe("lucid");
    });

    it("handles trailing commas in objects and arrays", () => {
      const input = `{
        "term": "perseverance",
        "items": ["a", "b", "c",],
      }`;
      const output = cleanAndParseJson<{ term: string; items: string[] }>(input);
      expect(output.term).toBe("perseverance");
      expect(output.items).toEqual(["a", "b", "c"]);
    });

    it("removes trailing commas without changing comma-like text inside JSON strings", () => {
      const output = cleanAndParseJson<{ note: string }>(
        '{"note":"Keep this comma, } exactly as written",}'
      );

      expect(output.note).toBe("Keep this comma, } exactly as written");
    });

    it("extracts embedded JSON from surrounding conversational text", () => {
      const input = `Sure! Here is the JSON data you asked for:
      {
        "status": "success",
        "score": 95
      }
      Hope this helps your learning journey!`;
      const output = cleanAndParseJson<{ status: string; score: number }>(input);
      expect(output.status).toBe("success");
      expect(output.score).toBe(95);
    });

    it("throws AIParseError when content is not JSON", () => {
      expect(() => cleanAndParseJson("This is not JSON at all.")).toThrow(AIParseError);
    });
  });

  describe("callGeminiStructured retries and schema validation", () => {
    it("retries on malformed JSON and succeeds on subsequent try", async () => {
      const service = new GeminiAIService(["KEY_1", "KEY_2"]);
      let attempt = 0;

      global.fetch = vi.fn(async () => {
        attempt++;
        if (attempt === 1) {
          // Malformed response
          return new Response("Invalid { non-json content", { status: 200 });
        }
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ value: "recovered" }) }],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }) as unknown as typeof fetch;

      const schema = z.object({ value: z.string() });
      const result = await service.callGeminiStructured({
        prompt: "test",
        schema,
        maxRetries: 2,
      });

      expect(result.value).toBe("recovered");
      expect(attempt).toBe(2);
    });

    it("rejects schema-invalid AI JSON after exactly one retry", async () => {
      const service = new GeminiAIService(["KEY_1"]);
      let attempts = 0;

      global.fetch = vi.fn(async () => {
        attempts++;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ value: 123 }) }],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }) as unknown as typeof fetch;

      await expect(
        service.callGeminiStructured({
          prompt: "test",
          schema: z.object({ value: z.string() }),
          maxRetries: 2,
        })
      ).rejects.toThrow("Dịch vụ AI trả về dữ liệu không hợp lệ");

      expect(attempts).toBe(2);
    });

    it("does not invoke fallback for a Gemini HTTP 500", async () => {
      const service = new GeminiAIService(["KEY_1"]);

      global.fetch = vi.fn(async () => {
        return new Response("Internal Server Error", { status: 500 });
      }) as unknown as typeof fetch;

      await expect(
        service.callGeminiStructured({
          prompt: "test",
          maxRetries: 1,
          fallback: () => ({ fallbackUsed: true }),
        })
      ).rejects.toThrow("Gemini API HTTP 500");
    });
  });
});
