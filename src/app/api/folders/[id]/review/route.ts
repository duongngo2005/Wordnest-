import { NextResponse } from "next/server";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { folderService } from "@/services/vocabulary";
import { fsrsService } from "@/services/fsrs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await folderService.getFolder(id);
    const queue = await fsrsService.getReviewQueue({ folderId: id });
    return NextResponse.json({ success: true, data: { cards: queue.queue, total: queue.queue.length } });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("Error loading collection review cards:", error);
    return NextResponse.json({ success: false, error: "Không thể tải thẻ cần ôn." }, { status: 500 });
  }
}
