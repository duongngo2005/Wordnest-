import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { quizService, QuizSubmissionError } from "@/services/vocabulary";
import { quizCheckSchema } from "@/lib/validation/quiz";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params;
    const body = await readJsonBody(request);

    const validation = quizCheckSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Dữ liệu kiểm tra câu hỏi không hợp lệ.",
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const result = await quizService.checkQuestionAnswer(deckId, validation.data);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (!(error instanceof QuizSubmissionError)) {
      console.error("Error checking quiz question:", error);
    }
    const message = error instanceof Error ? error.message : "Không thể kiểm tra câu trả lời.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: error instanceof QuizSubmissionError ? 400 : 500 }
    );
  }
}
