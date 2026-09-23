import { NextResponse } from "next/server";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { moveDeckSchema } from "@/lib/validation/folder";
import { folderService } from "@/services/vocabulary";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = moveDeckSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Đích đến không hợp lệ." },
        { status: 400 }
      );
    }

    const deck = await folderService.moveDeck(id, validation.data.folderId);
    return NextResponse.json({ success: true, deck });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error moving deck:", error);
    return NextResponse.json({ success: false, error: "Không thể chuyển bộ thẻ." }, { status: 500 });
  }
}
