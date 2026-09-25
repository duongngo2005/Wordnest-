"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { isSpeechSupported, pauseSpeech, resumeSpeech, speakEnglish, stopSpeech } from "@/lib/speech";
import { splitStoryIntoNarrationChunks } from "@/lib/story/story-narration";

type NarrationStatus = "idle" | "playing" | "paused";

const emptySubscribe = () => () => {};

export function StoryNarrationControls({ content, compact = false }: { content: string; compact?: boolean }) {
  const chunks = useMemo(() => splitStoryIntoNarrationChunks(content), [content]);
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const sessionRef = useRef(0);
  const speechSupported = useSyncExternalStore(emptySubscribe, isSpeechSupported, () => true);

  const stopNarration = useCallback(() => {
    sessionRef.current += 1;
    stopSpeech();
    setStatus("idle");
  }, []);

  useEffect(() => stopNarration, [stopNarration, content]);

  const startNarration = useCallback(() => {
    if (!speechSupported || chunks.length === 0) return;

    const session = sessionRef.current + 1;
    sessionRef.current = session;
    stopSpeech();
    setMessage(null);
    setStatus("playing");

    const speakChunk = (chunkIndex: number) => {
      if (sessionRef.current !== session) return;

      speakEnglish(
        chunks[chunkIndex],
        () => {
          if (sessionRef.current !== session) return;
          setStatus("playing");
        },
        () => {
          if (sessionRef.current !== session) return;
          if (chunkIndex + 1 < chunks.length) {
            speakChunk(chunkIndex + 1);
            return;
          }
          setStatus("idle");
        },
        () => {
          if (sessionRef.current !== session) return;
          setMessage("Không thể đọc bài này. Hãy thử lại.");
          setStatus("idle");
        },
        {
          onCloudFallback: () => {
            if (sessionRef.current === session) setMessage("Đang dùng giọng hệ thống.");
          },
        }
      );
    };

    speakChunk(0);
  }, [chunks, speechSupported]);

  const togglePlayback = () => {
    if (status === "playing") {
      if (pauseSpeech()) setStatus("paused");
      return;
    }
    if (status === "paused") {
      if (resumeSpeech()) setStatus("playing");
      return;
    }
    startNarration();
  };

  if (!speechSupported || chunks.length === 0) return null;

  const isActive = status !== "idle";
  const primaryLabel = status === "playing" ? "Tạm dừng" : status === "paused" ? "Tiếp tục" : "Đọc";

  if (compact) {
    return (
      <button
        type="button"
        onClick={togglePlayback}
        className="wn-story-icon-control"
        aria-label={primaryLabel}
        title={primaryLabel}
      >
        {status === "playing" ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <button
        type="button"
        onClick={togglePlayback}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[#E06B43] px-3 py-1.5 text-xs font-black text-white shadow-[2px_2px_0px_#221C16] transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
      >
        {status === "playing" ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : status === "paused" ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />}
        {primaryLabel}
      </button>
      {isActive ? (
        <button
          type="button"
          onClick={stopNarration}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-bold text-[#221C16] hover:bg-[#FEF3C7]"
        >
          <Square className="h-3.5 w-3.5" aria-hidden="true" /> Dừng
        </button>
      ) : null}
      {message ? <span className="text-xs font-bold text-[#6B6258]">{message}</span> : null}
    </div>
  );
}
