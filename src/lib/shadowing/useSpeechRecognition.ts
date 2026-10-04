"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API interface declarations for browser cross-compatibility
export interface SpeechRecognitionResultItem {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionAlternativeList {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionResultItem;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeList;
}

export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}

export interface BrowserSpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognitionInstance;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onResult?: (finalTranscript: string) => void;
  onError?: (error: string) => void;
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useSpeechRecognition({
  lang = "en-US",
  onResult,
  onError,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const [isSupported] = useState(() => {
    return typeof window !== "undefined" && Boolean(getSpeechRecognitionConstructor());
  });
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null);
  const isManuallyStoppedRef = useRef(false);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore if already stopped
      }
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      setError("Trình duyệt này chưa hỗ trợ nhận diện giọng nói tự động.");
      onError?.("UNSUPPORTED");
      return;
    }

    // Stop any active instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    resetTranscript();
    isManuallyStoppedRef.current = false;

    try {
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalStr = "";
        let interimStr = "";

        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          const text = item[0]?.transcript || "";
          if (item.isFinal) {
            finalStr += (finalStr ? " " : "") + text.trim();
          } else {
            interimStr += (interimStr ? " " : "") + text.trim();
          }
        }

        if (finalStr) {
          setTranscript(finalStr);
          onResult?.(finalStr);
        }
        setInterimTranscript(interimStr);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const errType = event.error;
        if (errType === "no-speech" || errType === "aborted") {
          // Normal lifecycle events, not fatal errors
          return;
        }

        let userMsg = "Lỗi khi nhận diện giọng nói.";
        if (errType === "not-allowed" || errType === "service-not-allowed") {
          userMsg = "WordNest chưa được phép dùng microphone. Hãy bật quyền microphone trong trình duyệt để luyện nói.";
        } else if (errType === "network") {
          userMsg = "Không thể kết nối đến dịch vụ nhận diện giọng nói.";
        }

        setError(userMsg);
        onError?.(userMsg);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể khởi động microphone.";
      setError(msg);
      onError?.(msg);
      setIsListening(false);
    }
  }, [lang, onResult, onError, resetTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
