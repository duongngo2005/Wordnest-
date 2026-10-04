import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import {
  aiStoryResponseSchema,
  createStoryFromJsonRequestSchema,
  generateStoryRequestSchema,
} from "@/lib/validation/story";
import { parseStoryResponseText } from "@/lib/story/story-content";
import { storyService } from "@/services/vocabulary";
import { AIError } from "@/services/ai";
import { aiErrorResponse } from "@/lib/http/ai-error";
import { normalizeStoryVocabulary } from "@/lib/story/story-vocabulary";

class StoryRequestValidationError extends Error {}


export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const isExternalJson = typeof body === "object" && body !== null && "rawStory" in body;
    const story = isExternalJson
      ? await createStoryFromValidatedJson(body)
      : await createStoryWithAi(body);
    return NextResponse.json({ success: true, story }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof StoryRequestValidationError) {
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

async function createStoryWithAi(body: unknown) {
  const validation = generateStoryRequestSchema.safeParse(body);
  if (!validation.success) {
    throw new StoryRequestValidationError(validation.error.issues[0]?.message || "Dữ liệu không hợp lệ");
  }
  const story = await storyService.createStory(validation.data);
  return prepareRequestedNarration(story, validation.data.narrationVoiceId);
}

async function createStoryFromValidatedJson(body: unknown) {
  const validation = createStoryFromJsonRequestSchema.safeParse(body);
  if (!validation.success) {
    throw new StoryRequestValidationError(validation.error.issues[0]?.message || "Dữ liệu không hợp lệ");
  }
  const story = await createStoryFromExternalJson(validation.data);
  return prepareRequestedNarration(story, validation.data.narrationVoiceId);
}

async function prepareRequestedNarration<T extends { id: string }>(
  story: T,
  narrationVoiceId?: import("@/lib/tts/voice-catalog").CloudTtsVoiceId
) {
  if (!narrationVoiceId) return story;
  await storyService.prepareStoryNarration(story.id, narrationVoiceId);
  return (await storyService.getStoryById(story.id)) ?? story;
}

async function createStoryFromExternalJson(data: {
  deckId: string;
  targetWords: string[];
  cefr: "A1" | "A2" | "B1" | "B2" | "C1";
  length: "short" | "medium" | "long";
  topic: string;
  rawStory: string;
}) {
  let parsedStory;
  try {
    const parsed = parseStoryResponseText(data.rawStory);
    const validated = aiStoryResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error("Nội dung truyện thiếu tiêu đề hoặc nội dung hợp lệ.");
    }
    parsedStory = validated.data;
  } catch (err) {
    throw new StoryRequestValidationError(
      err instanceof Error
        ? err.message
        : "Nội dung truyện chưa hợp lệ. Hãy dán lại đúng nội dung AI trả về (định dạng TITLE: ... PASSAGE: ... hoặc JSON)."
    );
  }

  return storyService.createStoryFromJson({ ...data, generated: parsedStory });
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
