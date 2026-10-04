"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Download, Pause, Play, Square, Volume2 } from "lucide-react";
import {
  isSpeechSupported,
  pauseSpeech,
  prepareCloudSpeech,
  releasePreparedCloudSpeech,
  resumeSpeech,
  speakEnglish,
  speakPreparedCloudSpeech,
  stopSpeech,
  type PreparedCloudSpeech,
} from "@/lib/speech";
import {
  DEFAULT_SPEECH_PREFERENCES,
  getSpeechPreferences,
  isCloudSpeechVoice,
  subscribeToSpeechPreferences,
} from "@/lib/speech-preferences";
import { splitStoryIntoNarrationChunks } from "@/lib/story/story-narration";
import type { StoryNarration } from "@/lib/story/story-vocabulary";
import type { CloudTtsVoiceId } from "@/lib/tts/voice-catalog";

type NarrationStatus = "idle" | "loading" | "playing" | "paused";
type PreparedNarration = { voiceId: CloudTtsVoiceId; audio: PreparedCloudSpeech[] };

const emptySubscribe = () => () => {};

export function StoryNarrationControls({
  storyId,
  content,
  narration,
  compact = false,
}: {
  storyId: string;
  content: string;
  narration: StoryNarration;
  compact?: boolean;
}) {
  const chunks = useMemo(() => splitStoryIntoNarrationChunks(content), [content]);
  const preferences = useSyncExternalStore(
    subscribeToSpeechPreferences,
    getSpeechPreferences,
    () => DEFAULT_SPEECH_PREFERENCES
  );
  const selectedVoiceId = isCloudSpeechVoice(preferences.voiceURI) ? preferences.voiceURI : null;
  const [readyVoiceIds, setReadyVoiceIds] = useState(narration.voiceIds);
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const sessionRef = useRef(0);
  const preparedRef = useRef<PreparedNarration | null>(null);
  const speechSupported = useSyncExternalStore(emptySubscribe, isSpeechSupported, () => true);
  const narrationIsReady = !selectedVoiceId || readyVoiceIds.includes(selectedVoiceId);

  const releasePreparedNarration = useCallback(() => {
    if (preparedRef.current) releasePreparedCloudSpeech(preparedRef.current.audio);
    preparedRef.current = null;
  }, []);

  const stopNarration = useCallback(() => {
    sessionRef.current += 1;
    stopSpeech();
    setStatus("idle");
  }, []);

  const prepareSelectedCloudNarration = useCallback(async (voiceId: CloudTtsVoiceId) => {
    const current = preparedRef.current;
    if (current?.voiceId === voiceId && current.audio.length === chunks.length) return current.audio;

    const audio = await prepareCloudSpeech(chunks, voiceId);
    releasePreparedNarration();
    preparedRef.current = { voiceId, audio };
    return audio;
  }, [chunks, releasePreparedNarration]);

  // The server has synthesized this version already. Preload cached bytes when
  // the reader opens so playback has no synthesis or fetch between chunks.
  useEffect(() => {
    let cancelled = false;
    if (!selectedVoiceId || !narration.voiceIds.includes(selectedVoiceId) || chunks.length === 0) {
      releasePreparedNarration();
      return;
    }

    void prepareCloudSpeech(chunks, selectedVoiceId)
      .then((audio) => {
        if (cancelled) {
          releasePreparedCloudSpeech(audio);
          return;
        }
        releasePreparedNarration();
        preparedRef.current = { voiceId: selectedVoiceId, audio };
      })
      .catch(() => {
        // A deliberate Play retry can surface a readable error.
      });

    return () => {
      cancelled = true;
      releasePreparedNarration();
    };
  }, [chunks, narration.voiceIds, releasePreparedNarration, selectedVoiceId]);

  useEffect(() => stopNarration, [stopNarration, content]);

  useEffect(() => {
    const stopWhenBackgrounded = () => {
      if (document.hidden) stopNarration();
    };
    document.addEventListener("visibilitychange", stopWhenBackgrounded);
    return () => document.removeEventListener("visibilitychange", stopWhenBackgrounded);
  }, [stopNarration]);

  const loadNarration = useCallback(async () => {
    if (!selectedVoiceId || status === "loading") return;

    setStatus("loading");
    setMessage("Đang nạp toàn bộ giọng đọc…");
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: selectedVoiceId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Không thể nạp giọng đọc.");

      const voiceIds = Array.isArray(payload.narration?.voiceIds)
        ? payload.narration.voiceIds.filter((voiceId: unknown): voiceId is CloudTtsVoiceId => typeof voiceId === "string")
        : [selectedVoiceId];
      setReadyVoiceIds(voiceIds);
      await prepareSelectedCloudNarration(selectedVoiceId);
      setMessage("Giọng đọc đã sẵn sàng.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể nạp giọng đọc.");
    } finally {
      setStatus("idle");
    }
  }, [prepareSelectedCloudNarration, selectedVoiceId, status, storyId]);

  const startNarration = useCallback(async () => {
    if (!speechSupported || chunks.length === 0 || status === "loading") return;

    const session = sessionRef.current + 1;
    sessionRef.current = session;
    stopSpeech();
    setMessage(null);
    const complete = () => { if (sessionRef.current === session) setStatus("idle"); };
    const fail = () => {
      if (sessionRef.current !== session) return;
      setMessage("Không thể đọc bài này. Hãy thử lại.");
      setStatus("idle");
    };

    if (selectedVoiceId) {
      setStatus("loading");
      try {
        const prepared = await prepareSelectedCloudNarration(selectedVoiceId);
        if (sessionRef.current !== session) return;
        setStatus("playing");
        const speakPreparedChunk = (chunkIndex: number) => {
          if (sessionRef.current !== session) return;
          const chunk = prepared[chunkIndex];
          if (!chunk) return complete();
          speakPreparedCloudSpeech(
            chunk,
            () => { if (sessionRef.current === session) setStatus("playing"); },
            () => {
              if (sessionRef.current !== session) return;
              if (chunkIndex + 1 < prepared.length) speakPreparedChunk(chunkIndex + 1);
              else complete();
            },
            fail,
            { onCloudFallback: () => setMessage("Đang dùng giọng hệ thống.") }
          );
        };
        speakPreparedChunk(0);
      } catch (error) {
        if (sessionRef.current !== session) return;
        setMessage(error instanceof Error ? error.message : "Không thể tải giọng đọc.");
        setStatus("idle");
      }
      return;
    }

    setStatus("playing");
    const speakSystemChunk = (chunkIndex: number) => {
      if (sessionRef.current !== session) return;
      speakEnglish(
        chunks[chunkIndex],
        () => { if (sessionRef.current === session) setStatus("playing"); },
        () => {
          if (sessionRef.current !== session) return;
          if (chunkIndex + 1 < chunks.length) speakSystemChunk(chunkIndex + 1);
          else complete();
        },
        fail
      );
    };
    speakSystemChunk(0);
  }, [chunks, prepareSelectedCloudNarration, selectedVoiceId, speechSupported, status]);

  const togglePlayback = () => {
    if (selectedVoiceId && !narrationIsReady) {
      void loadNarration();
      return;
    }
    if (status === "playing") {
      if (pauseSpeech()) setStatus("paused");
      return;
    }
    if (status === "paused") {
      if (resumeSpeech()) setStatus("playing");
      return;
    }
    void startNarration();
  };

  if (!speechSupported || chunks.length === 0) return null;

  const isActive = status === "playing" || status === "paused";
  const needsNarrationLoad = Boolean(selectedVoiceId && !narrationIsReady);
  const primaryLabel = needsNarrationLoad
    ? status === "loading" ? "Đang nạp" : "Nạp giọng đọc"
    : status === "playing" ? "Tạm dừng" : status === "paused" ? "Tiếp tục" : status === "loading" ? "Đang chuẩn bị" : "Đọc";

  if (compact) {
    return <button type="button" onClick={togglePlayback} disabled={status === "loading"} className="wn-story-icon-control disabled:cursor-wait disabled:opacity-60" aria-label={primaryLabel} title={primaryLabel}>{needsNarrationLoad ? <Download className="h-4 w-4" aria-hidden="true" /> : status === "playing" ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}</button>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <button type="button" onClick={togglePlayback} disabled={status === "loading"} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-white shadow-[2px_2px_0px_#221C16] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:cursor-wait disabled:opacity-70">
        {needsNarrationLoad ? <Download className="h-3.5 w-3.5" aria-hidden="true" /> : status === "playing" ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : status === "paused" ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />}
        {primaryLabel}
      </button>
      {isActive ? <button type="button" onClick={stopNarration} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-bold text-[#221C16] hover:bg-[#FEF3C7]"><Square className="h-3.5 w-3.5" aria-hidden="true" /> Dừng</button> : null}
      {message ? <span className="text-xs font-bold text-[#6B6258]">{message}</span> : null}
    </div>
  );
}
