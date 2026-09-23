import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceNotFoundError } from "@/lib/http/errors";
import {
  fsrsService,
  Rating,
  ScheduledReviewConflictError,
  ScheduledReviewNotDueError,
} from "@/services/fsrs";
import { z } from "zod";

const reviewSchema = z.object({
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  reviewEventId: z.string().uuid(),
  expectedSchedulerVersion: z.number().int().nonnegative(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = reviewSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Đánh giá không hợp lệ. Chỉ chấp nhận các mức 1 (Again), 2 (Hard), 3 (Good), 4 (Easy).",
        },
        { status: 400 }
      );
    }

    const result = await fsrsService.processScheduledReview(id, {
      rating: validation.data.rating as Rating,
      reviewEventId: validation.data.reviewEventId,
      expectedSchedulerVersion: validation.data.expectedSchedulerVersion,
    });

    return NextResponse.json({
      success: true,
      card: result.card,
      log: result.log,
      nextDue: result.nextDue,
      intervalText: result.intervalText,
      status: result.status,
      idempotent: result.idempotent,
    });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof ScheduledReviewConflictError || error instanceof ScheduledReviewNotDueError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error processing flashcard review:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể xử lý đánh giá thẻ.",
      },
      { status: 500 }
    );
  }
}
