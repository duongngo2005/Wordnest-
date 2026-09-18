import { NextResponse } from "next/server";
import { storyService } from "@/services/vocabulary";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const story = await storyService.getStoryById(id);

    if (!story) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy câu chuyện" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, story });
  } catch (error) {
    console.error("Error fetching story:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải câu chuyện" },
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
    await storyService.deleteStory(id);
    return NextResponse.json({ success: true, message: "Đã xóa câu chuyện" });
  } catch (error) {
    console.error("Error deleting story:", error);
    return NextResponse.json(
      { success: false, error: "Không thể xóa câu chuyện" },
      { status: 500 }
    );
  }
}
