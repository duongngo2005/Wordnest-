import { NextResponse } from "next/server";
import { z } from "zod";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { getServerStudyTimezone } from "@/lib/study-timezone-server";
import {
  MAX_ONLINE_ACTIVITY_SECONDS_PER_REPORT,
  onlineActivityService,
} from "@/services/online-activity-service";

const onlineActivitySchema = z
  .object({
    seconds: z.number().int().min(1).max(MAX_ONLINE_ACTIVITY_SECONDS_PER_REPORT),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = onlineActivitySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Khoảng thời gian hoạt động không hợp lệ." },
        { status: 400 }
      );
    }

    const timezone = await getServerStudyTimezone();
    await onlineActivityService.recordActiveSeconds(validation.data.seconds, timezone);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Error recording online activity:", error);
    return NextResponse.json(
      { success: false, error: "Không thể ghi nhận thời gian hoạt động." },
      { status: 500 }
    );
  }
}
