/**
 * Browser SpeechSynthesis helper for English pronunciation
 */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakEnglish(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (error: unknown) => void
) {
  if (!isSpeechSupported()) {
    console.warn("SpeechSynthesis is not supported in this browser environment.");
    onError?.(new Error("Speech synthesis not supported"));
    return;
  }

  try {
    window.speechSynthesis.cancel(); // Stop any currently playing audio

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9; // Clear, comfortable pace for learners
    utterance.pitch = 1.0;

    if (onStart) utterance.onstart = onStart;
    if (onEnd) utterance.onend = onEnd;
    if (onError) {
      utterance.onerror = (event) => {
        // Ignored if cancelled deliberately
        if (event.error !== "canceled" && event.error !== "interrupted") {
          onError(event);
        } else {
          onEnd?.();
        }
      };
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("Failed to speak text:", err);
    onError?.(err);
  }
}
