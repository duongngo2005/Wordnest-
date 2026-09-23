import { NextResponse } from "next/server";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { createDeckInFolderSchema } from "@/lib/validation/folder";
import { folderService } from "@/services/vocabulary";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = createDeckInFolderSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu bộ thẻ không hợp lệ." },
        { status: 400 }
      );
    }

    const deck = await folderService.createDeckInFolder(
      id,
      validation.data.name,
      validation.data.description
    );
    return NextResponse.json({ success: true, deck }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error creating deck in learning collection:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tạo bộ thẻ trong collection." },
      { status: 500 }
    );
  }
}
