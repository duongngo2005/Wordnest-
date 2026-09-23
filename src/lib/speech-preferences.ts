export const SPEECH_PREFERENCE_STORAGE_KEY = "wordnest.speech-preferences.v1";

export const SPEECH_RATES = [0.75, 0.9, 1, 1.15] as const;

export type SpeechRate = (typeof SPEECH_RATES)[number];

export type SpeechPreferences = {
  voiceURI: string | null;
  rate: SpeechRate;
};

export const DEFAULT_SPEECH_PREFERENCES: SpeechPreferences = {
  voiceURI: null,
  rate: 0.9,
};

const SPEECH_PREFERENCES_CHANGED_EVENT = "wordnest:speech-preferences-changed";

let cachedSpeechPreferences = DEFAULT_SPEECH_PREFERENCES;
let cachedPreferenceStorageValue: string | null | undefined;
let cachedEnglishVoices: SpeechSynthesisVoice[] = [];
let cachedEnglishVoiceSignature = "";

function isSpeechRate(value: unknown): value is SpeechRate {
  return typeof value === "number" && SPEECH_RATES.includes(value as SpeechRate);
}

function isPreferencesRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseSpeechPreferences(value: string | null): SpeechPreferences {
  if (!value) return DEFAULT_SPEECH_PREFERENCES;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isPreferencesRecord(parsed)) return DEFAULT_SPEECH_PREFERENCES;

    return {
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : null,
      rate: isSpeechRate(parsed.rate) ? parsed.rate : DEFAULT_SPEECH_PREFERENCES.rate,
    };
  } catch {
    return DEFAULT_SPEECH_PREFERENCES;
  }
}

export function getSpeechPreferences(): SpeechPreferences {
  if (typeof window === "undefined") return DEFAULT_SPEECH_PREFERENCES;

  try {
    const storedValue = window.localStorage.getItem(SPEECH_PREFERENCE_STORAGE_KEY);
    if (storedValue !== cachedPreferenceStorageValue) {
      cachedPreferenceStorageValue = storedValue;
      cachedSpeechPreferences = parseSpeechPreferences(storedValue);
    }
    return cachedSpeechPreferences;
  } catch {
    return cachedSpeechPreferences;
  }
}

export function saveSpeechPreferences(preferences: SpeechPreferences): void {
  if (typeof window === "undefined") return;

  const serializedPreferences = JSON.stringify(preferences);
  cachedPreferenceStorageValue = serializedPreferences;
  cachedSpeechPreferences = preferences;

  try {
    window.localStorage.setItem(SPEECH_PREFERENCE_STORAGE_KEY, serializedPreferences);
  } catch {
    // Audio should still use this session's choice if persistent storage is unavailable.
  }

  window.dispatchEvent(new Event(SPEECH_PREFERENCES_CHANGED_EVENT));
}

export function subscribeToSpeechPreferences(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === SPEECH_PREFERENCE_STORAGE_KEY) onStoreChange();
  };

  window.addEventListener(SPEECH_PREFERENCES_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(SPEECH_PREFERENCES_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

export function getEnglishSpeechVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];

  const englishVoices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
    .sort((firstVoice, secondVoice) => firstVoice.name.localeCompare(secondVoice.name));
  const voiceSignature = englishVoices
    .map((voice) => `${voice.voiceURI}:${voice.lang}:${voice.name}`)
    .join("|");

  if (voiceSignature !== cachedEnglishVoiceSignature) {
    cachedEnglishVoiceSignature = voiceSignature;
    cachedEnglishVoices = englishVoices;
  }

  return cachedEnglishVoices;
}

export function subscribeToEnglishSpeechVoices(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};

  window.speechSynthesis.addEventListener("voiceschanged", onStoreChange);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", onStoreChange);
}
