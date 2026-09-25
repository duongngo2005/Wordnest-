import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { generateStoryRequestSchema } from "@/lib/validation/story";
import { storyService } from "@/services/vocabulary";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = generateStoryRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const prompt = await storyService.getStoryGenerationPrompt(validation.data);
    return NextResponse.json({ success: true, prompt });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Không thể tạo prompt.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
