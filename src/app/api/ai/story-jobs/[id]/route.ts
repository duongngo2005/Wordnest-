import { NextResponse } from "next/server";
import { aiJobService } from "@/services/ai/ai-job-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await aiJobService.getJob(id);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy tác vụ AI." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error("[GET /api/ai/story-jobs/[id]] Error getting job:", error);
    return NextResponse.json(
      { success: false, error: "Không thể lấy thông tin tác vụ AI." },
      { status: 500 }
    );
  }
}
