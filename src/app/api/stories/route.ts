import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { generateStoryRequestSchema } from "@/lib/validation/story";
import { storyService } from "@/services/vocabulary";
import { AIError } from "@/services/ai";
import { aiErrorResponse } from "@/lib/http/ai-error";
import { normalizeStoryVocabulary } from "@/lib/story/story-vocabulary";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = generateStoryRequestSchema.safeParse(body);

    if (!validation.success) {
      const errorMsg = validation.error.issues?.[0]?.message || "Dữ liệu không hợp lệ";
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    const story = await storyService.createStory(validation.data);
    return NextResponse.json({ success: true, story }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof AIError) {
      return aiErrorResponse(error);
    }
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
    const storyData = stories.map((story) => ({
      ...story,
      vocabulary: normalizeStoryVocabulary(story.targetWords),
    }));
    return NextResponse.json({ success: true, stories: storyData });
  } catch (error) {
    console.error("Error fetching stories:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải danh sách truyện" },
      { status: 500 }
    );
  }
}
