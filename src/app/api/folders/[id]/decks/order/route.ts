import { NextResponse } from "next/server";
import { ResourceConflictError, ResourceNotFoundError } from "@/lib/http/errors";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { reorderFolderDecksSchema } from "@/lib/validation/folder";
import { folderService } from "@/services/vocabulary";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = reorderFolderDecksSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Danh sách sắp xếp không hợp lệ." },
        { status: 400 }
      );
    }

    await folderService.reorderDecks(id, validation.data.deckIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof ResourceConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error ordering decks in learning collection:", error);
    return NextResponse.json(
      { success: false, error: "Không thể sắp xếp các bộ thẻ." },
      { status: 500 }
    );
  }
}
