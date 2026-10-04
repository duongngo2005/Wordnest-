import { NextResponse } from "next/server";
import {
  AIError,
  AIProviderUnavailableError,
} from "@/services/ai/ai-core";

type AIClientErrorCode = "AI_PROVIDER_UNAVAILABLE";

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
  if (error instanceof AIProviderUnavailableError) {
    return NextResponse.json(errorPayload("AI_PROVIDER_UNAVAILABLE"), { status: 503 });
  }

  return NextResponse.json(errorPayload("AI_PROVIDER_UNAVAILABLE"), { status: 503 });
}
