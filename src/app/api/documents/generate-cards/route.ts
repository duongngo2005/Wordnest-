import { NextResponse } from "next/server";
import { deckService } from "@/services/vocabulary";
import { generateCardsFromImportSchema } from "@/lib/validation/document";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = generateCardsFromImportSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Dữ liệu yêu cầu tạo thẻ không hợp lệ",
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const { deckId, deckName, items } = validation.data;
    const result = await deckService.createCardsFromImport({
      deckId,
      deckName,
      items,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error creating flashcards from import:", error);
    const message =
      error instanceof Error ? error.message : "Không thể tạo bộ thẻ từ tài liệu.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
