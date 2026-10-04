import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { AIError, AIProviderUnavailableError } from "@/services/ai/ai-core";
import { explainService } from "@/services/ai/explain-service";
import { explainAnswerRequestSchema } from "@/lib/validation/explain";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);

    const validation = explainAnswerRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Dữ liệu yêu cầu giải thích không hợp lệ.",
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const explanation = await explainService.explainMistake(validation.data);

    return NextResponse.json({
      success: true,
      data: explanation,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }

    if (error instanceof AIProviderUnavailableError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503 }
      );
    }

    if (error instanceof AIError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 502 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Không thể tạo lời giải thích lúc này.";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
