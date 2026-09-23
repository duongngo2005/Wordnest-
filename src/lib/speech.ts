/**
 * Browser Speech & Audio helper for English pronunciation.
 * Optimized for desktop and mobile browsers (iOS Safari, Android Chrome).
 */
import { getSpeechPreferences } from "./speech-preferences";

// Retain global references to prevent garbage collection on mobile WebKit/Chromium
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudio: HTMLAudioElement | null = null;

export function isSpeechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    ("speechSynthesis" in window || typeof Audio !== "undefined")
  );
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
}

export function configureEnglishUtterance(utterance: SpeechSynthesisUtterance): void {
  const preferences = getSpeechPreferences();
  utterance.lang = "en-US";
  utterance.rate = preferences.rate;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = preferences.voiceURI
    ? voices.find((voice) => voice.voiceURI === preferences.voiceURI)
    : undefined;
  const englishVoice =
    preferredVoice ||
    voices.find((voice) => voice.lang === "en-US") ||
    voices.find((voice) => voice.lang.startsWith("en"));

  if (englishVoice) utterance.voice = englishVoice;
}

/**
 * Fallback to playing audio via HTML5 Audio element using Google TTS.
 * This works on mobile devices where Web Speech API is muted by silent switch,
 * missing English TTS voice packages, or unsupported in in-app webviews.
 */
export function playAudioFallback(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (error: unknown) => void
) {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    onError?.(new Error("Audio playback is not supported"));
    return;
  }

  try {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }

    const trimmed = text.trim().slice(0, 200);
    const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(
      trimmed
    )}`;

    const audio = new Audio(audioUrl);
    audio.playbackRate = getSpeechPreferences().rate;
    activeAudio = audio;

    audio.onplay = () => {
      onStart?.();
    };

    audio.onended = () => {
      if (activeAudio === audio) activeAudio = null;
      onEnd?.();
    };

    audio.onerror = (e) => {
      if (activeAudio === audio) activeAudio = null;
      console.warn("Audio fallback playback error:", e);
      onError?.(e);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        if (activeAudio === audio) activeAudio = null;
        console.warn("Audio play promise rejected:", err);
        onError?.(err);
      });
    }
  } catch (err) {
    activeAudio = null;
    console.error("Failed to play audio fallback:", err);
    onError?.(err);
  }
}

export function speakEnglish(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (error: unknown) => void
) {
  if (typeof window === "undefined") return;

  const hasSpeechSynthesis = isSpeechSynthesisSupported();

  // If SpeechSynthesis is not supported, directly use HTML5 Audio fallback
  if (!hasSpeechSynthesis) {
    playAudioFallback(text, onStart, onEnd, onError);
    return;
  }

  try {
    // If an audio element is currently playing, stop it
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }

    // On mobile browsers, resume if paused
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Only cancel if speaking to avoid dropping the next utterance on iOS Safari
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    activeUtterance = utterance;

    configureEnglishUtterance(utterance);

    let hasStarted = false;

    utterance.onstart = () => {
      hasStarted = true;
      onStart?.();
    };

    utterance.onend = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }
      onEnd?.();
    };

    utterance.onerror = (event) => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }

      // If cancelled or interrupted intentionally, do not trigger fallback
      if (event.error === "canceled" || event.error === "interrupted") {
        onEnd?.();
        return;
      }

      console.warn("SpeechSynthesis error, trying Audio fallback:", event.error);
      // Seamlessly fall back to HTML5 Audio so the user still hears the pronunciation!
      playAudioFallback(text, onStart, onEnd, onError);
    };

    window.speechSynthesis.speak(utterance);

    // Mobile watchdog: on some mobile browsers (e.g. Chrome on Android without TTS or iOS muted),
    // speech synthesis hangs silently without firing onstart or onerror.
    // If not started within 1000ms and not speaking, switch to audio fallback.
    setTimeout(() => {
      if (!hasStarted && activeUtterance === utterance && !window.speechSynthesis.speaking) {
        console.warn("SpeechSynthesis didn't start in 1000ms, using Audio fallback");
        activeUtterance = null;
        playAudioFallback(text, onStart, onEnd, onError);
      }
    }, 1000);
  } catch (err) {
    console.warn("SpeechSynthesis invocation threw error, falling back to Audio:", err);
    activeUtterance = null;
    playAudioFallback(text, onStart, onEnd, onError);
  }
}
