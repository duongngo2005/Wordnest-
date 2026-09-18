import { NextResponse } from "next/server";
import { generateDeckRequestSchema } from "@/lib/validation/flashcard";
import { deckService } from "@/services/vocabulary";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = generateDeckRequestSchema.safeParse(body);

    if (!validation.success) {
      const errorMsg = validation.error.issues?.[0]?.message || "Dữ liệu không hợp lệ";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    const { rawInput, deckName } = validation.data;
    const deck = await deckService.createDeckWithCards(rawInput, deckName);

    return NextResponse.json({ success: true, deck }, { status: 201 });
  } catch (error) {
    console.error("Error creating deck:", error);
    const message = error instanceof Error ? error.message : "Đã có lỗi xảy ra khi tạo bộ từ vựng";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const recentDecks = await deckService.getRecentDecks(10);
    return NextResponse.json({ success: true, decks: recentDecks });
  } catch (error) {
    console.error("Error fetching decks:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải danh sách bộ từ vựng" },
      { status: 500 }
    );
  }
}
