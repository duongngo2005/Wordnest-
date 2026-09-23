import { NextResponse } from "next/server";
import { progressService } from "@/services/vocabulary";

export async function GET() {
  try {
    const summary = await progressService.getGlobalAnalytics();
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
