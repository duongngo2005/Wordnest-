import { NextResponse } from "next/server";
import { readJsonBody, InvalidJsonBodyError } from "@/lib/http/json";
import { generateStoryRequestSchema } from "@/lib/validation/story";
import { aiJobService } from "@/services/ai/ai-job-service";

function idempotencyKeyFrom(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as Record<string, unknown>).idempotencyKey;
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value) ? value : undefined;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = generateStoryRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.issues[0]?.message || "Dữ liệu yêu cầu không hợp lệ.",
        },
        { status: 400 }
      );
    }

    const input = {
      deckId: validation.data.deckId,
      targetWords: validation.data.targetWords,
      cefr: validation.data.cefr,
      length: validation.data.length,
      topic: validation.data.topic,
      narrationVoiceId: validation.data.narrationVoiceId,
    };
    const idempotencyKey = idempotencyKeyFrom(body);
    const job = idempotencyKey
      ? await aiJobService.createStoryJob(input, idempotencyKey)
      : await aiJobService.createStoryJob(input);

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
    console.error("[POST /api/ai/story-jobs] Error creating job:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể tạo tác vụ AI.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";

    if (activeOnly) {
      const [activeJobs, counts] = await Promise.all([
        aiJobService.getActiveAndRecentJobs(),
        aiJobService.getQueueCounts(),
      ]);
      return NextResponse.json({ success: true, jobs: activeJobs, counts });
    }

    return NextResponse.json(
      { success: false, error: "Query parameter 'active=true' is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[GET /api/ai/story-jobs] Error listing jobs:", error);
    return NextResponse.json(
      { success: false, error: "Không thể lấy danh sách tác vụ AI." },
      { status: 500 }
    );
  }
}
