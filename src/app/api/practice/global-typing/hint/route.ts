import { NextResponse } from "next/server";
import { z } from "zod";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { globalTypingPracticeService } from "@/services/vocabulary";

const hintRequestSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = hintRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Yêu cầu gợi ý không hợp lệ." }, { status: 400 });
    }
    await globalTypingPracticeService.recordHint(validation.data.sessionId, validation.data.questionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể ghi nhận việc dùng gợi ý." },
      { status: 400 }
    );
  }
}
