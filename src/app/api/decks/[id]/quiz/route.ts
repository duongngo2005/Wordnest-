import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { quizService, QuizQuestionType, QuizSubmissionError } from "@/services/vocabulary";
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
    const modeParam = searchParams.get("mode");
    const storyId = searchParams.get("storyId") || undefined;

    if (modeParam === "focused_practice") {
      const quizData = await quizService.getFocusedPracticeQuiz(
        deckId,
        isNaN(count) ? 10 : count
      );
      return NextResponse.json({
        success: true,
        data: quizData,
      });
    }

    const allowedTypes: QuizQuestionType[] =
      modeParam === "story_cloze"
        ? ["story_cloze"]
        : modeParam === "typed" || modeParam === "typed_vi_en"
        ? ["typed_vi_en"]
        : ["multiple_choice_en_vi", "multiple_choice_vi_en", "fill_in_blank"];

    const quizData = await quizService.getDeckQuiz(
      deckId,
      isNaN(count) ? 10 : count,
      allowedTypes,
      storyId
    );

    return NextResponse.json({
      success: true,
      data: quizData,
    });
  } catch (error) {
    if (!(error instanceof ResourceNotFoundError)) {
      console.error("Error generating quiz:", error);
    }
    const message = error instanceof Error ? error.message : "Không thể tạo bài quiz.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: error instanceof ResourceNotFoundError ? 404 : 400 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params;
    const body = await readJsonBody(request);

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
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (!(error instanceof QuizSubmissionError)) {
      console.error("Error submitting quiz:", error);
    }
    const message = error instanceof Error ? error.message : "Không thể lưu kết quả quiz.";
    const isSessionConflict =
      error instanceof QuizSubmissionError &&
      (error.message.includes("Phiên quiz không hợp lệ hoặc đã hết hạn") ||
        error.message.includes("Phiên quiz đã được gửi"));
    const status =
      error instanceof QuizSubmissionError
        ? isSessionConflict
          ? 409
          : 400
        : 500;
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}
