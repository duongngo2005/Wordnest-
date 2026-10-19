import { NextResponse } from "next/server";
import { aiJobService } from "@/services/ai/ai-job-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const idempotencyKey = body && typeof body === "object" && typeof body.idempotencyKey === "string"
      ? body.idempotencyKey : undefined;
    const job = await aiJobService.retryJob(id, idempotencyKey);
    return NextResponse.json({ success: true, jobId: job.id, job }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể thử lại tác vụ AI." },
      { status: 400 }
    );
  }
}
