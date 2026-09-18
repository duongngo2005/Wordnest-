import { NextResponse } from "next/server";
import { deckService } from "@/services/vocabulary";
import { FlashcardStatus } from "@prisma/client";
import { z } from "zod";

const updateStatusSchema = z.object({
  status: z.nativeEnum(FlashcardStatus),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = updateStatusSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Trạng thái thẻ không hợp lệ" },
        { status: 400 }
      );
    }

    const updatedCard = await deckService.updateCardStatus(id, validation.data.status);
    return NextResponse.json({ success: true, card: updatedCard });
  } catch (error) {
    console.error("Error updating card status:", error);
    return NextResponse.json(
      { success: false, error: "Không thể cập nhật trạng thái thẻ" },
      { status: 500 }
    );
  }
}
