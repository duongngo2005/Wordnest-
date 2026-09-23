import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { manualDeckRequestSchema } from "@/lib/validation/flashcard";
import { deckService } from "@/services/vocabulary";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = manualDeckRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu thẻ không hợp lệ." },
        { status: 400 }
      );
    }

    const deck = await deckService.createManualDeckWithCards(validation.data);
    return NextResponse.json({ success: true, deck }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error creating manual deck:", error);
    return NextResponse.json({ success: false, error: "Không thể tạo bộ thẻ thủ công." }, { status: 500 });
  }
}
