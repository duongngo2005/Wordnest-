import { NextResponse } from "next/server";
import { quizService } from "@/services/vocabulary";
import { quizSubmissionSchema } from "@/lib/validation/quiz";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params;
    const { searchParams } = new URL(request.url);
    const countParam = searchParams.get("count");
    const count = countParam ? parseInt(countParam, 10) : 10;

    const quizData = await quizService.getDeckQuiz(deckId, isNaN(count) ? 10 : count);

    return NextResponse.json({
      success: true,
      data: quizData,
    });
  } catch (error) {
    console.error("Error generating quiz:", error);
    const message = error instanceof Error ? error.message : "Không thể tạo bài quiz.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params;
    const body = await request.json();

    const validation = quizSubmissionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Dữ liệu kết quả quiz không hợp lệ",
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const result = await quizService.submitQuizResult(deckId, validation.data);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    const message = error instanceof Error ? error.message : "Không thể lưu kết quả quiz.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
