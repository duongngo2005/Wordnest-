import { NextResponse } from "next/server";
import { isCloudTtsAvailable } from "@/lib/tts/tts-runtime";
import { CLOUD_TTS_VOICES } from "@/lib/tts/voice-catalog";

export function GET() {
  const enabled = isCloudTtsAvailable();
  return NextResponse.json({ enabled, voices: enabled ? CLOUD_TTS_VOICES : [] });
}
