import { NextResponse } from "next/server";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { folderService } from "@/services/vocabulary";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const progress = await folderService.getFolderProgress(id);
    return NextResponse.json({ success: true, data: progress });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error loading collection progress:", error);
    return NextResponse.json({ success: false, error: "Không thể tải tiến độ collection." }, { status: 500 });
  }
}
