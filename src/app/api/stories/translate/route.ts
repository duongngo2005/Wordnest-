import { NextResponse } from "next/server";
import { translateInContextRequestSchema } from "@/lib/validation/story";
import { aiService } from "@/services/ai";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = translateInContextRequestSchema.safeParse(body);

    if (!validation.success) {
      const msg = validation.error.issues?.[0]?.message || "Dữ liệu dịch không hợp lệ";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const { selectedText, surroundingSentence, context } = validation.data;
    const translation = await aiService.translateInContext({
      selectedText,
      surroundingSentence,
      context,
    });

    return NextResponse.json({ success: true, translation });
  } catch (error) {
    console.error("Error translating in context:", error);
    const msg = error instanceof Error ? error.message : "Không thể dịch từ trong ngữ cảnh này.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
