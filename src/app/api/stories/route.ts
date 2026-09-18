import { NextResponse } from "next/server";
import { generateStoryRequestSchema } from "@/lib/validation/story";
import { storyService } from "@/services/vocabulary";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = generateStoryRequestSchema.safeParse(body);

    if (!validation.success) {
      const errorMsg = validation.error.issues?.[0]?.message || "Dữ liệu không hợp lệ";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    const story = await storyService.createStory(validation.data);
    return NextResponse.json({ success: true, story }, { status: 201 });
  } catch (error) {
    console.error("Error generating story:", error);
    const msg = error instanceof Error ? error.message : "Không thể tạo câu chuyện.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deckId = searchParams.get("deckId");

    if (!deckId) {
      return NextResponse.json(
        { success: false, error: "deckId parameter is required" },
        { status: 400 }
      );
    }

    const stories = await storyService.getStoriesByDeckId(deckId);
    return NextResponse.json({ success: true, stories });
  } catch (error) {
    console.error("Error fetching stories:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải danh sách truyện" },
      { status: 500 }
    );
  }
}
