import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { quizSubmissionSchema } from "@/lib/validation/quiz";
import { globalTypingPracticeService } from "@/services/vocabulary";
import { QuizSubmissionError } from "@/services/vocabulary/quiz-service";

export async function GET() {
  try {
    const data = await globalTypingPracticeService.createDueSession();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error creating due typing session:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tạo lượt luyện gõ từ đến hạn. Hãy thử lại." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = quizSubmissionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Dữ liệu kết quả luyện gõ không hợp lệ.", details: validation.error.issues },
        { status: 400 }
      );
    }
    const data = await globalTypingPracticeService.submitDueSession(validation.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    const sessionConflict =
      error instanceof QuizSubmissionError &&
      (error.message.includes("không hợp lệ") || error.message.includes("đã được gửi"));
    if (!(error instanceof QuizSubmissionError)) {
      console.error("Error saving due typing results:", error);
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể lưu kết quả luyện gõ." },
      { status: sessionConflict ? 409 : 400 }
    );
  }
}
