import { NextResponse } from "next/server";
import { progressService } from "@/services/vocabulary";
import { getServerStudyTimezone } from "@/lib/study-timezone-server";

export async function GET() {
  try {
    const timezone = await getServerStudyTimezone();
    const summary = await progressService.getGlobalAnalytics(timezone);
    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error loading progress summary:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Không thể tải báo cáo tiến độ học tập.",
      },
      { status: 500 }
    );
  }
}
