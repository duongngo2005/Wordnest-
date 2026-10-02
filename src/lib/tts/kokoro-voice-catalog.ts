import type { CloudTtsVoiceId } from "./voice-catalog";

/** Server-only mapping from the stable WordNest catalog to local Kokoro voices. */
export const KOKORO_VOICE_IDS: Record<CloudTtsVoiceId, string> = {
  "wordnest:ava": "af_heart",
  "wordnest:emma": "af_bella",
  "wordnest:jenny": "af_nicole",
  "wordnest:andrew": "am_michael",
  "wordnest:davis": "am_adam",
  "wordnest:brian": "am_liam",
  "wordnest:sonia": "bf_emma",
  "wordnest:ryan": "bm_george",
};

export function getKokoroVoiceId(voiceId: CloudTtsVoiceId): string {
  return KOKORO_VOICE_IDS[voiceId];
}
