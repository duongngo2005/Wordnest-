import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { aiErrorResponse } from "@/lib/http/ai-error";
import { generateDeckRequestSchema } from "@/lib/validation/flashcard";
import { deckService } from "@/services/vocabulary";
import { AIError } from "@/services/ai/ai-core";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = generateDeckRequestSchema.safeParse(body);

    if (!validation.success) {
      const errorMsg = validation.error.issues?.[0]?.message || "Dữ liệu không hợp lệ";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    const { rawInput, deckName, folderId } = validation.data;
    const deck = await deckService.createDeckWithCards(rawInput, deckName, folderId);

    return NextResponse.json({ success: true, deck }, { status: 201 });
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
