import { NextResponse } from "next/server";
import { deckService } from "@/services/vocabulary";
import { z } from "zod";

const updateCardSchema = z.object({
  term: z.string().min(1).optional(),
  meaningVi: z.string().min(1).optional(),
  definitionEn: z.string().min(1).optional(),
  ipa: z.string().nullable().optional(),
  partOfSpeech: z.string().nullable().optional(),
  cefr: z.string().nullable().optional(),
  exampleEn: z.string().min(1).optional(),
  exampleVi: z.string().min(1).optional(),
  imageUrl: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = updateCardSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Dữ liệu cập nhật không hợp lệ" },
        { status: 400 }
      );
    }

    const updatedCard = await deckService.updateCard(id, validation.data);
    return NextResponse.json({ success: true, card: updatedCard });
  } catch (error) {
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
    console.error("Error deleting card:", error);
    return NextResponse.json(
      { success: false, error: "Không thể xóa thẻ" },
      { status: 500 }
    );
  }
}
