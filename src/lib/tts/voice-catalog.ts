export const CLOUD_TTS_VOICE_IDS = [
  "wordnest:ava",
  "wordnest:emma",
  "wordnest:jenny",
  "wordnest:andrew",
  "wordnest:davis",
  "wordnest:brian",
  "wordnest:sonia",
  "wordnest:ryan",
] as const;

export type CloudTtsVoiceId = (typeof CLOUD_TTS_VOICE_IDS)[number];

export type CloudTtsVoice = {
  id: CloudTtsVoiceId;
  name: string;
  locale: "en-US" | "en-GB";
  accent: "Mỹ" | "Anh";
  gender: "Nữ" | "Nam";
};

export const CLOUD_TTS_VOICES = [
  { id: "wordnest:ava", name: "Ava", locale: "en-US", accent: "Mỹ", gender: "Nữ" },
  { id: "wordnest:emma", name: "Emma", locale: "en-US", accent: "Mỹ", gender: "Nữ" },
  { id: "wordnest:jenny", name: "Jenny", locale: "en-US", accent: "Mỹ", gender: "Nữ" },
  { id: "wordnest:andrew", name: "Andrew", locale: "en-US", accent: "Mỹ", gender: "Nam" },
  { id: "wordnest:davis", name: "Davis", locale: "en-US", accent: "Mỹ", gender: "Nam" },
  { id: "wordnest:brian", name: "Brian", locale: "en-US", accent: "Mỹ", gender: "Nam" },
  { id: "wordnest:sonia", name: "Sonia", locale: "en-GB", accent: "Anh", gender: "Nữ" },
  { id: "wordnest:ryan", name: "Ryan", locale: "en-GB", accent: "Anh", gender: "Nam" },
] as const satisfies readonly CloudTtsVoice[];

export const MAX_TTS_TEXT_LENGTH = 600;

export function getCloudTtsVoice(voiceId: string | null | undefined): CloudTtsVoice | undefined {
  return CLOUD_TTS_VOICES.find((voice) => voice.id === voiceId);
}

export function isCloudTtsVoiceId(voiceId: string | null | undefined): voiceId is CloudTtsVoiceId {
  return Boolean(getCloudTtsVoice(voiceId));
}

export function normalizeTtsText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
