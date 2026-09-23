import { NextResponse } from "next/server";
import {
  AIError,
  AINoKeysConfiguredError,
  AIProviderUnavailableError,
  AIQuotaExceededError,
  AIRateLimitError,
} from "@/services/ai/ai-core";

type AIClientErrorCode =
  | "AI_QUOTA_EXCEEDED"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_UNAVAILABLE";

function errorPayload(code: AIClientErrorCode) {
  return {
    success: false,
    code,
    message: "AI is temporarily unavailable.",
    canFallbackToManual: true,
  };
}

/** Converts domain AI errors into a stable API contract for the creation UI. */
export function aiErrorResponse(error: AIError): NextResponse {
  if (error instanceof AIQuotaExceededError) {
    return NextResponse.json(errorPayload("AI_QUOTA_EXCEEDED"), { status: 429 });
  }

  if (error instanceof AIRateLimitError) {
    return NextResponse.json(errorPayload("AI_RATE_LIMITED"), { status: 429 });
  }

  if (error instanceof AIProviderUnavailableError || error instanceof AINoKeysConfiguredError) {
    return NextResponse.json(errorPayload("AI_PROVIDER_UNAVAILABLE"), { status: 503 });
  }

  return NextResponse.json(errorPayload("AI_PROVIDER_UNAVAILABLE"), { status: 503 });
}
