import { NextResponse } from "next/server";
import { aiJobService } from "@/services/ai/ai-job-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await aiJobService.cancelJob(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/ai/story-jobs/[id]/cancel] Error cancelling job:", error);
    return NextResponse.json(
      { success: false, error: "Không thể hủy tác vụ AI." },
      { status: 500 }
    );
  }
}
