import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { quizCheckSchema } from "@/lib/validation/quiz";
import { globalTypingPracticeService } from "@/services/vocabulary";
import { QuizSubmissionError } from "@/services/vocabulary/quiz-service";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = quizCheckSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Dữ liệu kiểm tra câu trả lời không hợp lệ.", details: validation.error.issues },
        { status: 400 }
      );
    }
    const data = await globalTypingPracticeService.checkDueAnswer(validation.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (!(error instanceof QuizSubmissionError)) {
      console.error("Error checking due typing answer:", error);
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể kiểm tra câu trả lời." },
      { status: error instanceof QuizSubmissionError ? 400 : 500 }
    );
  }
}
