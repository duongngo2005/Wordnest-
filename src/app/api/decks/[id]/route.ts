import { NextResponse } from "next/server";
import { deckService } from "@/services/vocabulary";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    await deckService.deleteDeck(id);
    return NextResponse.json({ success: true, message: "Đã xóa bộ từ vựng" });
  } catch (error) {
    console.error("Error deleting deck:", error);
    return NextResponse.json(
      { success: false, error: "Không thể xóa bộ từ vựng" },
      { status: 500 }
    );
  }
}
