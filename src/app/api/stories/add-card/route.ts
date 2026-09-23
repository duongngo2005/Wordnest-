import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { addCardFromStoryRequestSchema } from "@/lib/validation/story";
import { storyService } from "@/services/vocabulary";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = addCardFromStoryRequestSchema.safeParse(body);

    if (!validation.success) {
      const msg = validation.error.issues?.[0]?.message || "Dữ liệu tạo thẻ không hợp lệ";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const result = await storyService.addCardFromStory(validation.data);

    if (result.alreadyExists) {
      return NextResponse.json(
        {
          success: false,
          alreadyExists: true,
          message: result.message,
          card: result.card,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        alreadyExists: false,
        message: result.message,
        card: result.card,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error adding card from story:", error);
    const msg = error instanceof Error ? error.message : "Không thể thêm thẻ từ câu chuyện";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
