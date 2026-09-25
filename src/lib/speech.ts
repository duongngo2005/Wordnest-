/**
 * The single client-side speech boundary. Cloud audio is requested only for a
 * curated WordNest voice; system voices always stay in the browser.
 */
import { getSpeechPreferences, isCloudSpeechVoice } from "./speech-preferences";

type SpeechCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
  onCloudFallback?: () => void;
};

type SpeakOptions = {
  voiceURI?: string | null;
  onCloudFallback?: () => void;
};

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudio: HTMLAudioElement | null = null;

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && (isSpeechSynthesisSupported() || typeof Audio !== "undefined");
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && Boolean(window.speechSynthesis);
}

export function configureEnglishUtterance(
  utterance: SpeechSynthesisUtterance,
  voiceURI = getSpeechPreferences().voiceURI
): void {
  const preferences = getSpeechPreferences();
  utterance.lang = "en-US";
  utterance.rate = preferences.rate;
  utterance.pitch = 1;

  if (!isSpeechSynthesisSupported()) return;

  const voices = window.speechSynthesis.getVoices();
  const selectedVoice = !isCloudSpeechVoice(voiceURI)
    ? voices.find((voice) => voice.voiceURI === voiceURI)
    : undefined;
  const englishVoice = selectedVoice ?? findDefaultEnglishVoice(voices);

  if (englishVoice) {
    utterance.voice = englishVoice;
    utterance.lang = englishVoice.lang;
  }
}

export function speakEnglish(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (error: unknown) => void,
  options: SpeakOptions = {}
): void {
  const callbacks: SpeechCallbacks = { onStart, onEnd, onError, onCloudFallback: options.onCloudFallback };
  const voiceURI = options.voiceURI === undefined ? getSpeechPreferences().voiceURI : options.voiceURI;

  if (isCloudSpeechVoice(voiceURI)) {
    playCloudSpeech(text, voiceURI, callbacks);
    return;
  }

  playSystemSpeech(text, voiceURI, callbacks);
}

export function stopSpeech(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }

  cancelSystemSpeech();
}

export function pauseSpeech(): boolean {
  if (activeAudio && !activeAudio.paused) {
    activeAudio.pause();
    return true;
  }
  if (isSpeechSynthesisSupported() && window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    return true;
  }
  return false;
}

export function resumeSpeech(): boolean {
  if (activeAudio?.paused) {
    void activeAudio.play();
    return true;
  }
  if (isSpeechSynthesisSupported() && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    return true;
  }
  return false;
}

function playCloudSpeech(text: string, voiceURI: string, callbacks: SpeechCallbacks): void {
  if (typeof Audio === "undefined") {
    fallbackToSystemSpeech(text, callbacks);
    return;
  }

  const audio = new Audio(`/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voiceURI)}`);
  const previousAudio = activeAudio;
  const rate = getSpeechPreferences().rate;
  let didFallback = false;
  let didStart = false;

  audio.preload = "auto";
  audio.playbackRate = rate;
  audio.defaultPlaybackRate = rate;
  audio.onplay = () => {
    if (didStart) return;
    didStart = true;
    callbacks.onStart?.();
  };
  audio.onended = () => {
    if (activeAudio === audio) activeAudio = null;
    callbacks.onEnd?.();
  };
  audio.onerror = () => {
    if (activeAudio === audio) activeAudio = null;
    if (!didFallback) fallbackToSystemSpeech(text, callbacks, () => {
      didFallback = true;
    });
  };

  // iOS Safari requires this to be the first media call in the user gesture.
  activeAudio = audio;
  const playPromise = audio.play();
  previousAudio?.pause();
  cancelSystemSpeech();
  trySetAudioSessionPlayback();

  void playPromise?.catch(() => {
    if (activeAudio === audio) activeAudio = null;
    if (!didFallback) fallbackToSystemSpeech(text, callbacks, () => {
      didFallback = true;
    });
  });
}

function fallbackToSystemSpeech(text: string, callbacks: SpeechCallbacks, markFallback?: () => void): void {
  markFallback?.();
  callbacks.onCloudFallback?.();
  playSystemSpeech(text, null, callbacks);
}

function playSystemSpeech(text: string, voiceURI: string | null, callbacks: SpeechCallbacks): void {
  if (!isSpeechSynthesisSupported()) {
    callbacks.onError?.(new Error("System speech is not supported"));
    return;
  }

  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  cancelSystemSpeech();

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    activeUtterance = utterance;
    configureEnglishUtterance(utterance, voiceURI);
    utterance.onstart = callbacks.onStart ?? null;
    utterance.onend = () => {
      if (activeUtterance === utterance) activeUtterance = null;
      callbacks.onEnd?.();
    };
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") return;
      if (activeUtterance === utterance) activeUtterance = null;
      callbacks.onError?.(event);
    };
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    activeUtterance = null;
    callbacks.onError?.(error);
  }
}

function cancelSystemSpeech(): void {
  if (isSpeechSynthesisSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    window.speechSynthesis.cancel();
  }
  activeUtterance = null;
}

function findDefaultEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const normalize = (locale: string) => locale.toLowerCase().replace(/_/g, "-");
  return (
    voices.find((voice) => normalize(voice.lang) === "en-us") ??
    voices.find((voice) => normalize(voice.lang).startsWith("en-")) ??
    voices.find((voice) => normalize(voice.lang) === "en")
  );
}

function trySetAudioSessionPlayback(): void {
  try {
    if (typeof navigator !== "undefined" && "audioSession" in navigator && window.isSecureContext) {
      // @ts-expect-error WebKit AudioSession is not declared by TypeScript's DOM lib yet.
      navigator.audioSession.type = "playback";
    }
  } catch {
    // Feature detection can still pass while the WebKit setter rejects.
  }
}
