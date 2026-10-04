import { NextResponse } from "next/server";
import { readJsonBody, InvalidJsonBodyError } from "@/lib/http/json";
import { isCloudTtsAvailable } from "@/lib/tts/tts-runtime";
import { isCloudTtsVoiceId } from "@/lib/tts/voice-catalog";
import { storyService } from "@/services/vocabulary";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await readJsonBody(request);
    const voiceId = isRecord(body) ? body.voiceId : null;
    if (typeof voiceId !== "string" || !isCloudTtsVoiceId(voiceId)) {
      return NextResponse.json({ success: false, error: "Giọng đọc WordNest không hợp lệ." }, { status: 400 });
    }
    if (!isCloudTtsAvailable()) {
      return NextResponse.json({ success: false, error: "Giọng WordNest hiện chưa sẵn sàng." }, { status: 503 });
    }

    const { id } = await params;
    const narration = await storyService.prepareStoryNarration(id, voiceId);
    return NextResponse.json({ success: true, narration });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: "Dữ liệu giọng đọc không hợp lệ." }, { status: 400 });
    }
    console.error("[POST /api/stories/[id]/narration] Error preparing narration:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể nạp giọng đọc." },
      { status: 500 }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
