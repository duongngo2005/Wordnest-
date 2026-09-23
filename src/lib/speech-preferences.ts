export const SPEECH_PREFERENCE_STORAGE_KEY = "wordnest.speech-preferences.v1";

export const SPEECH_RATES = [0.75, 0.9, 1, 1.15] as const;

export type SpeechRate = (typeof SPEECH_RATES)[number];

export const WORDNEST_SPEECH_VOICES = [
  { id: "wordnest:en-US", label: "WordNest · Mỹ", locale: "en-US" },
  { id: "wordnest:en-GB", label: "WordNest · Anh", locale: "en-GB" },
  { id: "wordnest:en-AU", label: "WordNest · Úc", locale: "en-AU" },
  { id: "wordnest:en-IN", label: "WordNest · Ấn", locale: "en-IN" },
] as const;

export type WordNestSpeechVoiceId = (typeof WORDNEST_SPEECH_VOICES)[number]["id"];
export type WordNestSpeechLocale = (typeof WORDNEST_SPEECH_VOICES)[number]["locale"];

export type SpeechPreferences = {
  voiceURI: string | null;
  rate: SpeechRate;
};

export const DEFAULT_SPEECH_PREFERENCES: SpeechPreferences = {
  voiceURI: "wordnest:en-US",
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

export function getWordNestSpeechVoice(voiceURI: string | null) {
  return WORDNEST_SPEECH_VOICES.find((voice) => voice.id === voiceURI);
}

export function isWordNestSpeechVoice(voiceURI: string | null): voiceURI is WordNestSpeechVoiceId {
  return Boolean(getWordNestSpeechVoice(voiceURI));
}

export function getWordNestSpeechLocale(voiceURI: string | null): WordNestSpeechLocale {
  return getWordNestSpeechVoice(voiceURI)?.locale ?? "en-US";
}

export function parseSpeechPreferences(value: string | null): SpeechPreferences {
  if (!value) return DEFAULT_SPEECH_PREFERENCES;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isPreferencesRecord(parsed)) return DEFAULT_SPEECH_PREFERENCES;

    return {
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : DEFAULT_SPEECH_PREFERENCES.voiceURI,
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

  const checkVoices = () => {
    const prevSig = cachedEnglishVoiceSignature;
    getEnglishSpeechVoices();
    if (cachedEnglishVoiceSignature !== prevSig) {
      onStoreChange();
    }
  };

  // Standard voiceschanged event
  window.speechSynthesis.addEventListener("voiceschanged", checkVoices);
  if ("onvoiceschanged" in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = checkVoices;
  }

  // Active polling to catch asynchronous voice loading on iOS Safari
  const pollingDelays = [100, 300, 600, 1200, 2500];
  const timerIds = pollingDelays.map((delay) => setTimeout(checkVoices, delay));

  // Voice detection on user touch/click (often wakes the WebKit speech synthesis daemon)
  window.addEventListener("touchstart", checkVoices, { passive: true, once: true });
  window.addEventListener("click", checkVoices, { passive: true, once: true });

  return () => {
    window.speechSynthesis.removeEventListener("voiceschanged", checkVoices);
    timerIds.forEach(clearTimeout);
    window.removeEventListener("touchstart", checkVoices);
    window.removeEventListener("click", checkVoices);
  };
}
