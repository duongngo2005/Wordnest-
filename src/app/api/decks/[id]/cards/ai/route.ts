import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { aiErrorResponse } from "@/lib/http/ai-error";
import {
  aiCardGenerationRequestSchema,
  aiCardPersistRequestSchema,
} from "@/lib/validation/flashcard";
import { AIError } from "@/services/ai";
import { CardValidationError, deckService } from "@/services/vocabulary";
import { ResourceNotFoundError } from "@/lib/http/errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);

    const generate = aiCardGenerationRequestSchema.safeParse(body);
    if (generate.success) {
      const data = await deckService.generateAiCardDrafts(id, generate.data.rawInput);
      return NextResponse.json({ success: true, data });
    }

    const persist = aiCardPersistRequestSchema.safeParse(body);
    if (persist.success) {
      const data = await deckService.persistAiCardDrafts(id, persist.data.cards);
      return NextResponse.json({ success: true, data }, { status: data.cardsCreated > 0 ? 201 : 200 });
    }

    return NextResponse.json(
      { success: false, error: "Yêu cầu tạo thẻ AI không hợp lệ." },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof AIError) return aiErrorResponse(error);
    if (error instanceof CardValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error creating AI card drafts:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tạo thẻ bằng AI." },
      { status: 500 }
    );
  }
}
