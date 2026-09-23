"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { configureEnglishUtterance, isSpeechSynthesisSupported } from "@/lib/speech";
import { splitStoryIntoNarrationChunks } from "@/lib/story/story-narration";

type NarrationStatus = "idle" | "playing" | "paused";

const emptySubscribe = () => () => {};

export function StoryNarrationControls({ content }: { content: string }) {
  const chunks = useMemo(() => splitStoryIntoNarrationChunks(content), [content]);
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [currentChunk, setCurrentChunk] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(0);
  const speechSupported = useSyncExternalStore(
    emptySubscribe,
    () => isSpeechSynthesisSupported(),
    () => true
  );

  const stopNarration = useCallback(() => {
    sessionRef.current += 1;
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    setStatus("idle");
    setCurrentChunk(0);
  }, []);

  useEffect(() => stopNarration, [stopNarration, content]);

  const startNarration = useCallback(() => {
    if (!speechSupported || chunks.length === 0) return;

    const session = sessionRef.current + 1;
    sessionRef.current = session;
    window.speechSynthesis.cancel();
    setError(null);
    setCurrentChunk(0);
    setStatus("playing");

    const speakChunk = (chunkIndex: number) => {
      if (sessionRef.current !== session) return;

      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      configureEnglishUtterance(utterance);
      utterance.onstart = () => {
        if (sessionRef.current !== session) return;
        setCurrentChunk(chunkIndex);
        setStatus("playing");
      };
      utterance.onend = () => {
        if (sessionRef.current !== session) return;
        if (chunkIndex + 1 < chunks.length) {
          speakChunk(chunkIndex + 1);
          return;
        }
        setStatus("idle");
        setCurrentChunk(0);
      };
      utterance.onerror = (event) => {
        if (sessionRef.current !== session) return;
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setError("Không thể đọc bài này trên thiết bị hiện tại.");
        }
        setStatus("idle");
        setCurrentChunk(0);
      };
      window.speechSynthesis.speak(utterance);
    };

    speakChunk(0);
  }, [chunks, speechSupported]);

  const togglePlayback = () => {
    if (status === "playing") {
      window.speechSynthesis.pause();
      setStatus("paused");
      return;
    }
    if (status === "paused") {
      window.speechSynthesis.resume();
      setStatus("playing");
      return;
    }
    startNarration();
  };

  if (!speechSupported || chunks.length === 0) return null;

  const isActive = status !== "idle";
  const primaryLabel = status === "playing" ? "Tạm dừng" : status === "paused" ? "Tiếp tục" : "Đọc toàn bộ";

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <button
        type="button"
        onClick={togglePlayback}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[#E06B43] px-3 py-1.5 text-xs font-black text-white shadow-[2px_2px_0px_#221C16] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
        aria-label={primaryLabel}
      >
        {status === "playing" ? <Pause className="h-3.5 w-3.5" /> : status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        {primaryLabel}
      </button>
      {isActive ? (
        <button
          type="button"
          onClick={stopNarration}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-bold text-[#221C16] hover:bg-[#FEF3C7] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
        >
          <Square className="h-3.5 w-3.5" /> Dừng
        </button>
      ) : null}
      {isActive ? <span className="text-xs font-bold text-[#6B6258]">Đoạn {currentChunk + 1}/{chunks.length}</span> : null}
      {error ? <span className="text-xs font-bold text-[#991B1B]">{error}</span> : null}
    </div>
  );
}
