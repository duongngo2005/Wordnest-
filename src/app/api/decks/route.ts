import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { createDeckSchema } from "@/lib/validation/folder";
import { deckService } from "@/services/vocabulary";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = createDeckSchema.safeParse(body);

    if (!validation.success) {
      const errorMsg = validation.error.issues?.[0]?.message || "Dữ liệu không hợp lệ";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    const deck = await deckService.createDeck(validation.data);

    return NextResponse.json({ success: true, deck }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error creating deck:", error);
    const message = error instanceof Error ? error.message : "Không thể tạo bộ từ.";
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
