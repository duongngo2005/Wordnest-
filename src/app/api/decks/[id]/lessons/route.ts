import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody, InvalidJsonBodyError } from "@/lib/http/json";
import { StoryCefrEnum } from "@/lib/validation/story";
import { aiJobService } from "@/services/ai/ai-job-service";
import { lessonService } from "@/services/vocabulary";

import { db } from "@/lib/db";

const generateLessonRequestSchema = z.object({
  targetWords: z
    .array(z.string().trim().min(1))
    .min(1, "Vui lòng chọn ít nhất 1 từ để tạo bài học.")
    .max(20, "Mỗi bài học chỉ nên tập trung tối đa 20 từ vựng."),
  cefr: StoryCefrEnum.optional().default("B1"),
  topic: z.string().trim().max(120, "Chủ đề bài học không được vượt quá 120 ký tự.").optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params;
    const lessons = await lessonService.getLessonsByDeckId(deckId);
    return NextResponse.json({ success: true, lessons });
  } catch (error) {
    console.error("[GET /api/decks/[id]/lessons] Error fetching lessons:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải danh sách bài học." },
      { status: 500 }
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
    const validation = generateLessonRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.issues[0]?.message || "Dữ liệu yêu cầu không hợp lệ.",
        },
        { status: 400 }
      );
    }

    const targetWords = validation.data.targetWords;
    const uniqueTargetWords = [...new Set(targetWords)];
    if (uniqueTargetWords.length !== targetWords.length) {
      return NextResponse.json(
        { success: false, error: "Mỗi từ vựng chỉ có thể được chọn một lần." },
        { status: 400 }
      );
    }

    const [deck, selectedCards] = await Promise.all([
      db.deck.findUnique({
        where: { id: deckId },
        select: { id: true },
      }),
      db.flashcard.findMany({
        where: { deckId, id: { in: uniqueTargetWords } },
        select: { id: true },
      }),
    ]);
    if (!deck) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy bộ thẻ." },
        { status: 404 }
      );
    }

    if (selectedCards.length !== uniqueTargetWords.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Một hoặc nhiều từ vựng không còn thuộc bộ thẻ này. Hãy chọn lại trước khi tạo bài học.",
        },
        { status: 400 }
      );
    }

    const job = await aiJobService.createLessonJob({
      deckId,
      targetWords: uniqueTargetWords,
      cefr: validation.data.cefr,
      topic: validation.data.topic,
    });

    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        status: job.status,
        stage: job.stage,
        queuePosition: job.queuePosition,
        job,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[POST /api/decks/[id]/lessons] Error creating lesson job:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể tạo bài học AI.",
      },
      { status: 500 }
    );
  }
}
