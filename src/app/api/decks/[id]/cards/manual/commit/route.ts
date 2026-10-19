import { NextResponse } from "next/server";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { manualFlashcardStudyCommitRequestSchema } from "@/lib/validation/flashcard";
import { deckService } from "@/services/vocabulary";
import { StaleManualFlashcardDuplicatePreviewError } from "@/services/vocabulary/deck-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = manualFlashcardStudyCommitRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu thẻ không hợp lệ." },
        { status: 400 }
      );
    }

    const data = await deckService.commitManualFlashcardFromStudy(
      id,
      validation.data.card,
      validation.data.decision
    );
    return NextResponse.json({ success: true, data }, { status: data.action === "created" ? 201 : 200 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof StaleManualFlashcardDuplicatePreviewError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error committing manual study flashcard:", error);
    return NextResponse.json(
      { success: false, error: "Không thể lưu thẻ lúc này." },
      { status: 500 }
    );
  }
}
