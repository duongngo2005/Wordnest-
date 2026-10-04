import { describe, expect, it } from "vitest";
import { AIProviderUnavailableError } from "@/services/ai/ai-core";
import { aiErrorResponse } from "./ai-error";

describe("aiErrorResponse", () => {
  it("maps provider outages without exposing provider messages", async () => {
    const unavailable = aiErrorResponse(new AIProviderUnavailableError("provider detail"));

    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
  });
});
