import { NextResponse } from "next/server";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { manualFlashcardDuplicatePreviewRequestSchema } from "@/lib/validation/flashcard";
import { deckService } from "@/services/vocabulary";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = manualFlashcardDuplicatePreviewRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu thẻ không hợp lệ." },
        { status: 400 }
      );
    }

    const data = await deckService.previewManualFlashcardDuplicate(id, validation.data.card);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error checking manual flashcard duplicate:", error);
    return NextResponse.json(
      { success: false, error: "Không thể kiểm tra thẻ trùng lúc này." },
      { status: 500 }
    );
  }
}
