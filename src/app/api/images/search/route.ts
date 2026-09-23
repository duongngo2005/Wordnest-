import { NextResponse } from "next/server";
import { imageSearchService } from "@/services/images";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() || "";
    const limitParam = parseInt(searchParams.get("limit") || "12", 10);
    const limit = isNaN(limitParam) ? 12 : Math.min(Math.max(limitParam, 1), 24);

    if (!query) {
      return NextResponse.json({ success: true, images: [] });
    }

    const images = await imageSearchService.searchCandidates(query, limit);
    return NextResponse.json({ success: true, images });
  } catch (error) {
    console.error("[ImageSearchAPI] Error searching images:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tìm kiếm hình ảnh", images: [] },
      { status: 500 }
    );
  }
}
