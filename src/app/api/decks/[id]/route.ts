import { NextResponse } from "next/server";
import { deckService } from "@/services/vocabulary";
import { DeckDeletionBlockedError, StaleDeletionPreviewError } from "@/services/vocabulary/deck-service";
import { ResourceNotFoundError } from "@/lib/http/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (new URL(request.url).searchParams.get("impact") === "delete") {
      const impact = await deckService.getDeckDeletionImpact(id);
      return NextResponse.json({ success: true, impact });
    }
    const deck = await deckService.getDeckById(id);

    if (!deck) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy bộ từ vựng" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deck });
  } catch (error) {
    console.error("Error fetching deck:", error);
    return NextResponse.json(
      { success: false, error: "Đã có lỗi xảy ra khi tải bộ từ vựng" },
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
    const previewFingerprint = request.headers.get("x-wordnest-deletion-preview");
    if (!previewFingerprint) {
      return NextResponse.json(
        { success: false, error: "Hãy xem trước ảnh hưởng hiện tại trước khi xác nhận xóa bộ từ." },
        { status: 400 }
      );
    }
    await deckService.deleteDeck(id, previewFingerprint);
    return NextResponse.json({ success: true, message: "Đã xóa bộ từ vựng" });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof DeckDeletionBlockedError) {
      return NextResponse.json(
        { success: false, error: error.message, impact: error.impact },
        { status: 409 }
      );
    }
    if (error instanceof StaleDeletionPreviewError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error deleting deck:", error);
    return NextResponse.json(
      { success: false, error: "Không thể xóa bộ từ vựng" },
      { status: 500 }
    );
  }
}
