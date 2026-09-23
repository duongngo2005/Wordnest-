import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { deckService } from "@/services/vocabulary";
import { updateFlashcardRequestSchema } from "@/lib/validation/flashcard";
import { CardValidationError, DuplicateFlashcardTermError } from "@/services/vocabulary/deck-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = updateFlashcardRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu cập nhật không hợp lệ" },
        { status: 400 }
      );
    }

    const updatedCard = await deckService.updateCard(id, validation.data);
    return NextResponse.json({ success: true, card: updatedCard });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof DuplicateFlashcardTermError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    if (error instanceof CardValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error updating card:", error);
    return NextResponse.json(
      { success: false, error: "Không thể cập nhật thẻ từ vựng" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deckService.deleteCard(id);
    return NextResponse.json({ success: true, message: "Đã xóa thẻ" });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error deleting card:", error);
    return NextResponse.json(
      { success: false, error: "Không thể xóa thẻ" },
      { status: 500 }
    );
  }
}
