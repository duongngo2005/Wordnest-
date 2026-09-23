/**
 * Browser Speech & Audio helper for English pronunciation.
 * Optimized for desktop and mobile browsers (iOS Safari, Android Chrome).
 *
 * iOS Safari on insecure HTTP origins (LAN IPs like 192.168.x.x) enforces an
 * extremely strict "user gesture" chain: audio.play() must be called in the
 * SAME synchronous microtask as the user tap. Any intervening API that
 * touches speechSynthesis, navigator.audioSession, or localStorage can
 * "consume" the gesture token and cause a silent NotAllowedError.
 *
 * To guarantee playback on every origin (localhost, LAN HTTP, Tailscale HTTPS,
 * cellular), this module follows two rules:
 *   1.  For WordNest server audio (the default), call `new Audio(url).play()`
 *       IMMEDIATELY — no speechSynthesis or audioSession calls beforehand.
 *   2.  Only touch speechSynthesis when the user explicitly picked a device voice.
 */
import {
  getSpeechPreferences,
  getWordNestSpeechLocale,
  isWordNestSpeechVoice,
  type WordNestSpeechLocale,
} from "./speech-preferences";

// Retain active references to prevent garbage collection on mobile browsers.
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

  if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis) {
    const voices = window.speechSynthesis.getVoices();
    const normalize = (l: string) => l.toLowerCase().replace(/_/g, "-");
    const preferredVoice = preferences.voiceURI
      ? voices.find((voice) => voice.voiceURI === preferences.voiceURI)
      : undefined;
    const englishVoice =
      preferredVoice ||
      voices.find((voice) => normalize(voice.lang) === "en-us") ||
      voices.find((voice) => normalize(voice.lang).startsWith("en-")) ||
      voices.find((voice) => normalize(voice.lang) === "en");

    if (englishVoice) {
      utterance.voice = englishVoice;
      utterance.lang = englishVoice.lang;
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup helpers — called AFTER audio.play() so they never consume the
// user-gesture token that iOS Safari requires.
// ---------------------------------------------------------------------------

function stopActiveAudio(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
}

function cancelSpeechSynthesis(): void {
  try {
    if (isSpeechSynthesisSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // speechSynthesis may throw on some insecure contexts — ignore.
  }
}

function trySetAudioSessionPlayback(): void {
  // navigator.audioSession is secure-context only (iOS 17+).
  // Must NOT be called before audio.play() on insecure origins.
  try {
    if (typeof navigator !== "undefined" && "audioSession" in navigator && window.isSecureContext) {
      // @ts-expect-error - WebKit AudioSession API
      navigator.audioSession.type = "playback";
    }
  } catch {
    // Silently ignore — feature detection may pass but setter can throw.
  }
}

// ---------------------------------------------------------------------------
// WordNest server-side audio playback (primary path).
//
// CRITICAL for iOS Safari on HTTP LAN:
//   new Audio(url) and audio.play() MUST be the first DOM / media calls
//   inside the synchronous click handler. Any preceding call to
//   speechSynthesis.cancel(), navigator.audioSession, or similar will
//   consume the user-gesture token and block playback.
// ---------------------------------------------------------------------------

export function playAudioFallback(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (error: unknown) => void,
  voice: WordNestSpeechLocale = getWordNestSpeechLocale(getSpeechPreferences().voiceURI)
) {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    onError?.(new Error("Audio playback is not supported"));
    return;
  }

  try {
    // ── 1. Build and play IMMEDIATELY — preserve user-gesture token ──
    const trimmed = text.trim().slice(0, 300);
    const audioUrl = `/api/tts?text=${encodeURIComponent(trimmed)}&voice=${encodeURIComponent(voice)}`;

    const audio = new Audio(audioUrl);
    const rate = getSpeechPreferences().rate;
    audio.preload = "auto";
    audio.volume = 1;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;

    stopActiveAudio();
    cancelSpeechSynthesis();
    activeAudio = audio;

    trySetAudioSessionPlayback();

    audio.addEventListener("loadedmetadata", () => {
      audio.playbackRate = rate;
    });

    let started = false;
    const triggerStart = () => {
      if (started) return;
      started = true;
      onStart?.();
    };

    audio.onplay = triggerStart;

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
      playPromise
        .then(() => {
          triggerStart();
        })
        .catch((err) => {
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

  const preferences = getSpeechPreferences();
  const isSecure = typeof window !== "undefined" && window.isSecureContext !== false;

  // On insecure HTTP contexts (e.g. LAN IP: http://192.168.x.x:3000),
  // Chrome, Edge, and other Chromium browsers RESTRICT or BLOCK the Web Speech API (speechSynthesis).
  // Attempting speechSynthesis on insecure origins causes Chrome to fail silently or reject.
  // Tailscale and localhost work because they are secure contexts (HTTPS or localhost).
  // Therefore, whenever isSecure is false, ALWAYS use WordNest server audio!
  if (
    !isSecure ||
    !isSpeechSynthesisSupported() ||
    isWordNestSpeechVoice(preferences.voiceURI)
  ) {
    playAudioFallback(text, onStart, onEnd, onError);
    return;
  }

  const selectedVoice = window.speechSynthesis
    .getVoices()
    .find((voice) => voice.voiceURI === preferences.voiceURI);

  if (!selectedVoice) {
    playAudioFallback(text, onStart, onEnd, onError);
    return;
  }

  // User explicitly chose a device voice — use SpeechSynthesis.
  stopActiveAudio();

  if (window.speechSynthesis.speaking || window.speechSynthesis.paused) {
    window.speechSynthesis.cancel();
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    activeUtterance = utterance;
    configureEnglishUtterance(utterance);

    let hasStarted = false;
    let didFallback = false;
    const startAudioFallback = () => {
      if (didFallback) return;
      didFallback = true;
      if (activeUtterance === utterance) activeUtterance = null;
      window.speechSynthesis.cancel();
      playAudioFallback(text, onStart, onEnd, onError);
    };

    utterance.onstart = () => {
      hasStarted = true;
      onStart?.();
    };
    utterance.onend = () => {
      if (didFallback) return;
      if (activeUtterance === utterance) activeUtterance = null;
      onEnd?.();
    };
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") {
        if (!didFallback) onEnd?.();
        return;
      }
      startAudioFallback();
    };

    window.speechSynthesis.speak(utterance);

    // Some browser speech engines hang without starting or reporting an error.
    // A selected device voice gets a brief chance, then the stable MP3 takes over.
    window.setTimeout(() => {
      if (!hasStarted && activeUtterance === utterance) startAudioFallback();
    }, 800);
  } catch {
    activeUtterance = null;
    playAudioFallback(text, onStart, onEnd, onError);
  }
}
