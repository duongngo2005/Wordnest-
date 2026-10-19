import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { quizSubmissionSchema } from "@/lib/validation/quiz";
import {
  GLOBAL_TYPING_COUNTS,
  globalTypingPracticeService,
  type GlobalTypingQueueMode,
} from "@/services/vocabulary";
import { QuizSubmissionError } from "@/services/vocabulary/quiz-service";

function parseSessionOptions(request: Request):
  | { mode: GlobalTypingQueueMode; count: number; retrySessionId?: string }
  | { error: string } {
  const { searchParams } = new URL(request.url);
  const modeValue = searchParams.get("mode") ?? "all";
  if (modeValue !== "all" && modeValue !== "weak" && modeValue !== "retry") {
    return { error: "Chế độ luyện gõ không hợp lệ." };
  }
  const countValue = Number(searchParams.get("count") ?? "10");
  if (!GLOBAL_TYPING_COUNTS.includes(countValue as (typeof GLOBAL_TYPING_COUNTS)[number])) {
    return { error: "Số câu luyện phải là 10, 20 hoặc 50." };
  }
  const retrySessionId = searchParams.get("retrySessionId")?.trim();
  if (modeValue === "retry" && !retrySessionId) {
    return { error: "Cần xác định phiên trước để ôn lại các từ sai." };
  }
  return { mode: modeValue, count: countValue, ...(retrySessionId ? { retrySessionId } : {}) };
}

export async function GET(request: Request) {
  const options = parseSessionOptions(request);
  if ("error" in options) {
    return NextResponse.json({ success: false, error: options.error }, { status: 400 });
  }

  try {
    const data = await globalTypingPracticeService.createSession(options);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error creating global typing session:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tạo lượt luyện gõ. Hãy thử lại." },
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
    const data = await globalTypingPracticeService.submit(validation.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    const sessionConflict =
      error instanceof QuizSubmissionError &&
      (error.message.includes("không hợp lệ") || error.message.includes("đã được gửi"));
    if (!(error instanceof QuizSubmissionError)) {
      console.error("Error saving global typing results:", error);
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể lưu kết quả luyện gõ." },
      { status: sessionConflict ? 409 : 400 }
    );
  }
}
