import { describe, expect, it } from "vitest";
import { AIProviderUnavailableError, AIQuotaExceededError, AIRateLimitError } from "@/services/ai/ai-core";
import { aiErrorResponse } from "./ai-error";

describe("aiErrorResponse", () => {
  it("exposes quota exhaustion as a structured manual-fallback error", async () => {
    const response = aiErrorResponse(new AIQuotaExceededError());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "AI_QUOTA_EXCEEDED",
      canFallbackToManual: true,
    });
  });

  it("maps rate limits and provider outages without exposing provider messages", async () => {
    const rateLimited = aiErrorResponse(new AIRateLimitError("provider detail", 90));
    const unavailable = aiErrorResponse(new AIProviderUnavailableError("provider detail"));

    expect(rateLimited.status).toBe(429);
    await expect(rateLimited.json()).resolves.toMatchObject({ code: "AI_RATE_LIMITED" });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
  });
});
