import { NextResponse } from "next/server";
import { readJsonBody, InvalidJsonBodyError } from "@/lib/http/json";
import { getTtsService, isCloudTtsAvailable } from "@/lib/tts/tts-runtime";
import {
  isCloudTtsVoiceId,
  MAX_TTS_TEXT_LENGTH,
  normalizeTtsText,
  type CloudTtsVoiceId,
} from "@/lib/tts/voice-catalog";

type ValidTtsRequest = { text: string; voiceId: CloudTtsVoiceId };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return synthesizeCloudAudio(searchParams.get("text"), searchParams.get("voice"));
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (!isRecord(body)) return invalidTtsRequest();
    return synthesizeCloudAudio(body.text, body.voice);
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) return invalidTtsRequest();
    console.warn("[TTS] Could not read request:", error);
    return unavailableCloudVoice();
  }
}

async function synthesizeCloudAudio(textValue: unknown, voiceValue: unknown): Promise<Response> {
  const validated = validateTtsRequest(textValue, voiceValue);
  if (!validated) return invalidTtsRequest();
  if (!isCloudTtsAvailable()) return unavailableCloudVoice();

  try {
    const audio = await getTtsService().synthesize(validated);
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (error) {
    console.warn("[TTS] Cloud synthesis failed:", error);
    return NextResponse.json({ error: "Không thể tạo âm thanh WordNest lúc này." }, { status: 503 });
  }
}

function validateTtsRequest(textValue: unknown, voiceValue: unknown): ValidTtsRequest | null {
  if (typeof textValue !== "string" || typeof voiceValue !== "string") return null;

  const text = normalizeTtsText(textValue);
  if (!text || text.length > MAX_TTS_TEXT_LENGTH || !isCloudTtsVoiceId(voiceValue)) return null;

  return { text, voiceId: voiceValue };
}

function invalidTtsRequest() {
  return NextResponse.json({ error: "Yêu cầu giọng đọc không hợp lệ." }, { status: 400 });
}

function unavailableCloudVoice() {
  return NextResponse.json({ error: "Giọng WordNest hiện chưa sẵn sàng." }, { status: 503 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
