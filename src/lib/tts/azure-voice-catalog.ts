import type { CloudTtsVoiceId } from "./voice-catalog";

/** Provider IDs stay server-only: callers use the WordNest IDs in voice-catalog. */
export const AZURE_SPEECH_VOICE_IDS: Record<CloudTtsVoiceId, string> = {
  "wordnest:ava": "en-US-Ava:DragonHDLatestNeural",
  "wordnest:emma": "en-US-Emma:DragonHDLatestNeural",
  "wordnest:jenny": "en-US-Jenny:DragonHDLatestNeural",
  "wordnest:andrew": "en-US-Andrew:DragonHDLatestNeural",
  "wordnest:davis": "en-US-Davis:DragonHDLatestNeural",
  "wordnest:brian": "en-US-Brian:DragonHDLatestNeural",
  "wordnest:sonia": "en-GB-Sonia:DragonHDLatestNeural",
  "wordnest:ryan": "en-GB-Ryan:DragonHDLatestNeural",
};

export function getAzureSpeechVoiceId(voiceId: CloudTtsVoiceId): string {
  return AZURE_SPEECH_VOICE_IDS[voiceId];
}
