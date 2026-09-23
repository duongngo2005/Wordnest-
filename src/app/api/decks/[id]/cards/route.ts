import { NextResponse } from "next/server";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { addCardsToDeckRequestSchema } from "@/lib/validation/flashcard";
import { deckService } from "@/services/vocabulary";
import { parseVocabularyInput } from "@/services/vocabulary/parser";
import { AIError } from "@/services/ai/ai-core";
import { aiErrorResponse } from "@/lib/http/ai-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = addCardsToDeckRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu từ vựng không hợp lệ." },
        { status: 400 }
      );
    }

    const parsedInput = parseVocabularyInput(validation.data.rawInput);
    if (parsedInput.error || parsedInput.terms.length === 0) {
      return NextResponse.json(
        { success: false, error: parsedInput.error || "Vui lòng nhập ít nhất một từ hoặc cụm từ." },
        { status: 400 }
      );
    }

    const result = await deckService.createCardsFromImport({
      deckId: id,
      items: parsedInput.terms.map((term) => ({ term })),
    });
    return NextResponse.json({ success: true, data: result }, { status: result.cardsCreated > 0 ? 201 : 200 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof AIError) {
      return aiErrorResponse(error);
    }
    console.error("Error adding flashcards to deck:", error);
    return NextResponse.json(
      { success: false, error: "Không thể thêm flashcard vào bộ thẻ." },
      { status: 500 }
    );
  }
}
