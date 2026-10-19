import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { translateInContextRequestSchema } from "@/lib/validation/story";
import { aiService } from "@/services/ai";
import { AIQueueBusyError } from "@/services/ai/ai-core";
import { storyService } from "@/services/vocabulary";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = translateInContextRequestSchema.safeParse(body);

    if (!validation.success) {
      const msg = validation.error.issues?.[0]?.message || "Dữ liệu dịch không hợp lệ";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const { storyId, deckId, selectedText, canonicalTerm, surroundingSentence, context } = validation.data;
    const cached = await storyService.findSelectionTranslation({
      storyId,
      deckId,
      selectedText,
      surroundingSentence,
    });
    if (cached) {
      return NextResponse.json({
        success: true,
        translation: cached.translation,
        canonicalTerm: cached.canonicalTerm ?? cached.translation.canonicalTerm,
        cached: true,
      });
    }

    const translation = await aiService.translateInContext({
      selectedText,
      canonicalTerm,
      surroundingSentence,
      context,
    });

    await storyService.persistContextualTranslation({
      storyId,
      deckId,
      selectedText,
      canonicalTerm: canonicalTerm ?? translation.canonicalTerm ?? undefined,
      surroundingSentence,
      translation,
    });

    return NextResponse.json({
      success: true,
      translation,
      canonicalTerm: canonicalTerm ?? translation.canonicalTerm,
      cached: false,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof AIQueueBusyError) {
      return NextResponse.json(
        { success: false, code: "AI_BUSY", error: "AI đang bận tạo nội dung — hãy thử lại sau." },
        { status: 409 }
      );
    }
    console.error("Error translating in context:", error);
    const msg = error instanceof Error ? error.message : "Không thể dịch từ trong ngữ cảnh này.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
