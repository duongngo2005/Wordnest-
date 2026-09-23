import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { manualCardsRequestSchema } from "@/lib/validation/flashcard";
import { deckService } from "@/services/vocabulary";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = manualCardsRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu thẻ không hợp lệ." },
        { status: 400 }
      );
    }

    const data = await deckService.createManualCards(id, validation.data.cards);
    return NextResponse.json({ success: true, data }, { status: data.cardsCreated > 0 ? 201 : 200 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error adding manual flashcards to deck:", error);
    return NextResponse.json({ success: false, error: "Không thể thêm thẻ thủ công vào bộ thẻ." }, { status: 500 });
  }
}
