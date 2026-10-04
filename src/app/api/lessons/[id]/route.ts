import { NextResponse } from "next/server";
import { lessonService } from "@/services/vocabulary";
import { ResourceNotFoundError } from "@/lib/http/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const lesson = await lessonService.getLessonById(id);

    if (!lesson) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy bài học." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, lesson });
  } catch (error) {
    console.error("[GET /api/lessons/[id]] Error fetching lesson:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải bài học." },
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
    await lessonService.deleteLesson(id);
    return NextResponse.json({ success: true, message: "Đã xóa bài học." });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("[DELETE /api/lessons/[id]] Error deleting lesson:", error);
    return NextResponse.json(
      { success: false, error: "Không thể xóa bài học." },
      { status: 500 }
    );
  }
}
