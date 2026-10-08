"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Headphones,
  Mic,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { segmentSentences } from "@/lib/shadowing/sentence-segmenter";
import {
  computeWordSimilarity,
  type ShadowingSimilarityResult,
} from "@/lib/shadowing/similarity";
import { useSpeechRecognition } from "@/lib/shadowing/useSpeechRecognition";
import { useAudioRecorder } from "@/lib/shadowing/useAudioRecorder";
import { speakEnglish, stopSpeech } from "@/lib/speech";
import { playUISound } from "@/lib/ui-sound";
import { getSpeechPreferences } from "@/lib/speech-preferences";

export type ShadowingSourceType = "lesson" | "story";

export interface ShadowingPlayerSource {
  id: string;
  deckId: string;
  title: string;
  content: string;
  type: ShadowingSourceType;
  cefr?: string | null;
}

export interface ShadowingPlayerProps {
  source: ShadowingPlayerSource;
  deck?: { id: string; name: string };
  onClose?: () => void;
  onExit?: () => void;
}

type AudioState =
  | "idle"
  | "requesting_microphone"
  | "playing_tts"
  | "recording"
  | "evaluating"
  | "completed";

export function ShadowingPlayer({ source, onClose, onExit }: ShadowingPlayerProps) {
  // 1. Sentence segmentation
  const sentences = useMemo(() => segmentSentences(source.content), [source.content]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    const preferredRate = getSpeechPreferences().rate;
    return [0.8, 1.0, 1.2].includes(preferredRate) ? preferredRate : 1.0;
  });
  const [referenceAudioError, setReferenceAudioError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("");
  const playerHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Recorded scores for summary
  const [sentenceScores, setSentenceScores] = useState<Record<number, number>>({});

  // Self audio playback element
  const selfAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingSelfAudio, setIsPlayingSelfAudio] = useState(false);

  // Current sentence
  const currentSentence = sentences[currentIndex] || "";
  const totalSentences = sentences.length;
  const isCompleted = currentIndex >= totalSentences;

  // Record score when speech recognition emits result
  const handleSpeechResult = useCallback(
    (finalText: string) => {
      if (currentSentence && finalText.trim()) {
        const result = computeWordSimilarity(currentSentence, finalText.trim());
        setSentenceScores((prev) => ({
          ...prev,
          [currentIndex]: Math.max(prev[currentIndex] || 0, result.similarity),
        }));
      }
    },
    [currentSentence, currentIndex]
  );

  // 2. Speech recognition hook
  const {
    isSupported: isSttSupported,
    isListening,
    transcript,
    interimTranscript,
    error: sttError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    lang: "en-US",
    onResult: handleSpeechResult,
  });

  // Derived similarity result (no setState in useEffect)
  const similarityResult = useMemo<ShadowingSimilarityResult | null>(() => {
    if (audioState !== "evaluating" && audioState !== "completed") return null;
    const activeText = (transcript || interimTranscript || "").trim();
    if (!activeText || !currentSentence) return null;
    return computeWordSimilarity(currentSentence, activeText);
  }, [audioState, transcript, interimTranscript, currentSentence]);

  // 3. Audio recorder hook
  const {
    isSupported: isRecorderSupported,
    hasCheckedSupport: hasCheckedRecorderSupport,
    isRecording,
    audioUrl,
    error: recorderError,
    startRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder();

  const exitLabel = source.type === "story" ? "Quay lại truyện" : "Quay lại bài học";
  const sourceName = source.type === "story" ? "truyện" : "bài học";

  useEffect(() => {
    playerHeadingRef.current?.focus();
  }, []);

  const liveMessage = referenceAudioError || recorderError || sttError || liveStatus;
  const isActivelyRecording = audioState === "recording" && isRecording;

  // Stop all active audio / mic
  const stopAllAudio = useCallback(() => {
    stopSpeech();
    stopRecording();
    stopListening();
    if (selfAudioRef.current) {
      selfAudioRef.current.pause();
      setIsPlayingSelfAudio(false);
    }
  }, [stopRecording, stopListening]);

  // Clean transition when switching sentences
  const resetSentenceState = useCallback(() => {
    stopAllAudio();
    resetTranscript();
    resetRecording();
    setAudioState("idle");
    setReferenceAudioError(null);
  }, [stopAllAudio, resetTranscript, resetRecording]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      stopSpeech();
      stopAllAudio();
    };
  }, [stopAllAudio]);

  // Handle Play TTS
  const handlePlayTts = () => {
    if (!currentSentence) return;
    playUISound("softTap");

    // Invariant: Stop any active recording/mic before TTS
    stopAllAudio();
    setAudioState("playing_tts");
    setReferenceAudioError(null);
    setLiveStatus("Đang đọc câu mẫu.");

    speakEnglish(
      currentSentence,
      () => {
        setAudioState("playing_tts");
      },
      () => {
        setAudioState("idle");
        setLiveStatus("Đã đọc xong câu mẫu.");
      },
      () => {
        setAudioState("idle");
        const message = "Không thể phát câu mẫu. Bạn có thể thử lại.";
        setReferenceAudioError(message);
        setLiveStatus(message);
      },
      { rate: playbackRate }
    );
  };

  // Handle Start Recording (User speaks)
  const handleStartRecording = async () => {
    if (audioState === "requesting_microphone" || isRecording) return;
    playUISound("softTap");

    // Invariant: Stop TTS immediately so mic doesn't record computer speakers
    stopSpeech();
    if (selfAudioRef.current) {
      selfAudioRef.current.pause();
      setIsPlayingSelfAudio(false);
    }

    setAudioState("requesting_microphone");
    setLiveStatus("Đang chuẩn bị micro.");
    resetTranscript();
    resetRecording();

    // Recognition and recording are independent. Recording must start successfully
    // before the player presents an active recording control.
    if (isSttSupported) {
      startListening();
    }
    const didStartRecording = await startRecording();
    if (!didStartRecording) {
      stopListening();
      setAudioState("idle");
      return;
    }

    setAudioState("recording");
    setLiveStatus(isSttSupported ? "Đang nhận diện lời nói." : "Đang ghi âm.");
  };

  // Handle Stop Recording
  const handleStopRecording = () => {
    playUISound("softTap");
    stopListening();
    stopRecording();
    const activeText = (transcript || interimTranscript || "").trim();
    if (activeText && currentSentence) {
      const result = computeWordSimilarity(currentSentence, activeText);
      setSentenceScores((prev) => ({
        ...prev,
        [currentIndex]: Math.max(prev[currentIndex] || 0, result.similarity),
      }));
    }
    setAudioState("evaluating");
    setLiveStatus(activeText ? "Đã có kết quả nhận diện để đối chiếu." : "Đã dừng ghi âm.");
  };

  // Self audio playback handler
  const handlePlaySelfAudio = () => {
    if (!audioUrl) return;
    playUISound("softTap");
    stopSpeech();

    if (!selfAudioRef.current) {
      selfAudioRef.current = new Audio(audioUrl);
      selfAudioRef.current.onended = () => setIsPlayingSelfAudio(false);
      selfAudioRef.current.onerror = () => setIsPlayingSelfAudio(false);
    } else {
      selfAudioRef.current.src = audioUrl;
    }

    setIsPlayingSelfAudio(true);
    selfAudioRef.current.play().catch(() => setIsPlayingSelfAudio(false));
  };

  // Move to next sentence
  const handleNext = () => {
    playUISound("softTap");
    if (similarityResult) {
      setSentenceScores((prev) => ({
        ...prev,
        [currentIndex]: Math.max(prev[currentIndex] || 0, similarityResult.similarity),
      }));
    }
    resetSentenceState();
    if (currentIndex + 1 < totalSentences) {
      setCurrentIndex((prev) => prev + 1);
      setLiveStatus(`Đã chuyển sang câu ${currentIndex + 2} trên ${totalSentences}.`);
    } else {
      setAudioState("completed");
      setCurrentIndex(totalSentences);
      setLiveStatus(`Bạn đã đi hết ${totalSentences} câu.`);
    }
  };

  // Move to previous sentence
  const handlePrevious = () => {
    if (currentIndex > 0) {
      playUISound("softTap");
      resetSentenceState();
      setCurrentIndex((prev) => prev - 1);
      setLiveStatus(`Đã chuyển sang câu ${currentIndex} trên ${totalSentences}.`);
    }
  };

  // Retry current sentence
  const handleRetry = () => {
    playUISound("softTap");
    resetSentenceState();
    setLiveStatus(`Bạn có thể nói lại câu ${currentIndex + 1}.`);
  };

  // Calculate overall summary score
  const averageScore = useMemo(() => {
    const scores = Object.values(sentenceScores);
    if (scores.length === 0) return null;
    const sum = scores.reduce((acc, curr) => acc + curr, 0);
    return Math.round(sum / scores.length);
  }, [sentenceScores]);

  // Back link
  const backHref =
    source.type === "lesson"
      ? `/decks/${source.deckId}/lesson?lessonId=${source.id}`
      : `/decks/${source.deckId}/story?storyId=${source.id}`;

  if (totalSentences === 0) {
    return (
      <section
        aria-labelledby="shadowing-title"
        className="mx-auto max-w-3xl rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-8 text-center space-y-4 shadow-[4px_4px_0px_#221C16]"
      >
        <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
        <h1 ref={playerHeadingRef} id="shadowing-title" tabIndex={-1} className="text-xl font-black text-[#221C16]">
          Không tìm thấy câu văn nào
        </h1>
        <p className="text-sm font-semibold text-[#6B6258]">
          Nội dung {sourceName} chưa có câu hoàn chỉnh để nghe và nói nhại.
        </p>
        {onExit || onClose ? (
          <button
            type="button"
            onClick={() => {
              stopAllAudio();
              (onExit || onClose)?.();
            }}
            className="brick-button-primary inline-flex px-4 py-2 text-xs font-bold"
          >
            {exitLabel}
          </button>
        ) : (
          <Link href={backHref} className="brick-button-primary inline-flex px-4 py-2 text-xs font-bold">
            {exitLabel}
          </Link>
        )}
      </section>
    );
  }

  // Completion Screen
  if (isCompleted || audioState === "completed") {
    return (
      <section
        aria-labelledby="shadowing-title"
        className="mx-auto max-w-2xl rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-6 sm:p-10 text-center space-y-6 shadow-[4px_4px_0px_#221C16] animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#221C16] bg-[#FEF3C7] shadow-[2px_2px_0px_#221C16]">
          <Sparkles className="h-8 w-8 text-[#D97706]" strokeWidth={2.5} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-wider text-[#D97706]">
            WordNest · Nghe &amp; nói nhại
          </p>
          <h1 ref={playerHeadingRef} id="shadowing-title" tabIndex={-1} className="text-2xl sm:text-3xl font-black text-[#221C16]">
            Bạn đã đi hết các câu
          </h1>
          <p className="text-sm font-semibold text-[#6B6258]">
            Bạn đã đi hết {totalSentences}/{totalSentences} câu trong &ldquo;{source.title}&rdquo;.
          </p>
        </div>

        {averageScore !== null && isSttSupported && (
          <div className="inline-block rounded-2xl border-2 border-[#221C16] bg-[#FAF6EE] px-6 py-4 shadow-[2px_2px_0px_#221C16]">
            <p className="text-xs font-bold text-[#6B6258]">Khớp văn bản nhận diện với câu mẫu</p>
            <p className="text-3xl sm:text-4xl font-black text-[#221C16] mt-1">
              {averageScore}%
            </p>
            <p className="text-[11px] font-medium text-[#8C8275] mt-1">
              Mức khớp tổng hợp dựa trên kết quả tốt nhất ở {Object.keys(sentenceScores).length}/{totalSentences} câu đã nhận diện.
            </p>
            <p className="text-[11px] font-medium text-[#8C8275] mt-1">
              Không đánh giá phát âm, giọng hay mức độ thành thạo.
            </p>
          </div>
        )}

        {averageScore === null && (
          <p className="text-xs font-semibold text-[#6B6258]">
            Chưa có kết quả nhận diện để đối chiếu.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 pt-4 border-t-2 border-dashed border-[#CFC2AF]">
          <button
            type="button"
            onClick={() => {
              playUISound("softTap");
              resetSentenceState();
              setCurrentIndex(0);
              setSentenceScores({});
            }}
            className="brick-button-secondary px-4 py-2 text-xs font-bold flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Luyện tập lại từ đầu</span>
          </button>

          {onExit || onClose ? (
            <button
              type="button"
              onClick={() => {
                stopAllAudio();
                (onExit || onClose)?.();
              }}
              className="brick-button-primary px-5 py-2.5 text-xs font-black flex items-center gap-2 shadow-[2px_2px_0px_#221C16]"
            >
              <span>{exitLabel}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href={backHref}
              className="brick-button-primary px-5 py-2.5 text-xs font-black flex items-center gap-2 shadow-[2px_2px_0px_#221C16]"
            >
              <span>{exitLabel}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="shadowing-title" className="mx-auto max-w-3xl space-y-5">
      <p className="wn-sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>
      {/* Top Header & Navigation */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onExit || onClose ? (
            <button
              type="button"
              onClick={() => {
                stopAllAudio();
                (onExit || onClose)?.();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] transition-transform active:translate-y-0.5"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
              <span>{exitLabel}</span>
            </button>
          ) : (
            <Link
              href={backHref}
              onClick={stopAllAudio}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] transition-transform active:translate-y-0.5"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
              <span>{exitLabel}</span>
            </Link>
          )}
          <span className="text-xs font-black text-[#6B6258] truncate max-w-[200px] sm:max-w-xs">
            {source.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Rate Selector */}
          <fieldset className="flex items-center rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-0.5 text-xs font-bold shadow-[2px_2px_0px_#221C16]">
            <legend className="wn-sr-only">Tốc độ câu mẫu</legend>
            {[0.8, 1.0, 1.2].map((rate) => (
              <label
                key={rate}
                className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-2 py-1 transition-colors ${
                  playbackRate === rate ? "bg-[#221C16] text-[#FFFDF9]" : "text-[#221C16] hover:bg-[#F5EEDB]"
                }`}
              >
                <input
                  type="radio"
                  name="shadowing-playback-rate"
                  value={rate}
                  checked={playbackRate === rate}
                  onChange={() => setPlaybackRate(rate)}
                  className="wn-sr-only"
                />
                {rate}x
              </label>
            ))}
          </fieldset>

          {onClose && (
            <button
              type="button"
              onClick={() => {
                stopAllAudio();
                onClose();
              }}
              className="p-1.5 text-[#6B6258] hover:text-[#221C16]"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Shadowing Workspace Card */}
      <div className="wn-story-paper relative rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-5 sm:p-8 space-y-6 shadow-[4px_4px_0px_#221C16]">
        <div className="space-y-1">
          <h1 ref={playerHeadingRef} id="shadowing-title" tabIndex={-1} className="text-xl font-black text-[#221C16] sm:text-2xl">
            Nghe &amp; nói nhại
          </h1>
          <p className="text-xs font-semibold leading-5 text-[#6B6258]">
            Tùy chọn: nghe câu mẫu, nói nhại, rồi xem văn bản mà trình duyệt nhận diện.
          </p>
          <p className="text-[11px] font-medium leading-5 text-[#8C8275]">
            Khớp văn bản nhận diện với câu mẫu; không đánh giá phát âm, giọng hay mức độ thành thạo.
          </p>
        </div>
        {/* Progress bar and counter */}
        <div className="flex items-center justify-between gap-3 text-xs font-black text-[#6B6258] border-b-2 border-dashed border-[#CFC2AF] pb-3">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-[var(--accent)]" />
            <span>Nghe &amp; nói nhại</span>
          </div>
          <div className="flex items-center gap-2">
            <span>
              Câu {currentIndex + 1} / {totalSentences}
            </span>
            <label htmlFor="shadowing-progress" className="wn-sr-only">
              Tiến độ câu
            </label>
            <progress
              id="shadowing-progress"
              aria-label="Tiến độ câu"
              value={currentIndex + 1}
              max={totalSentences}
              className="wn-sr-only"
            >
              {currentIndex + 1} / {totalSentences}
            </progress>
          </div>
        </div>

        {/* Informational banners for unsupported browser or permission denied */}
        {!isSttSupported && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <p>
              Trình duyệt này chưa hỗ trợ nhận diện giọng nói.{" "}
              {isRecorderSupported
                ? "Bạn vẫn có thể nghe câu mẫu, ghi âm và nghe lại."
                : "Bạn vẫn có thể nghe câu mẫu."}
            </p>
          </div>
        )}

        {hasCheckedRecorderSupport && !isRecorderSupported && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <p>Thiết bị này không hỗ trợ ghi âm. Bạn vẫn có thể nghe câu mẫu.</p>
          </div>
        )}

        {(sttError || recorderError || referenceAudioError) && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <p>{referenceAudioError || recorderError || sttError}</p>
          </div>
        )}

        {/* Target Sentence Display */}
        <div className="space-y-2 text-center sm:text-left py-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[#8C8275]">
            Câu cần luyện nói:
          </p>
          <p className="font-[family-name:var(--font-story-display)] text-xl sm:text-2xl font-bold leading-relaxed text-[#221C16] [overflow-wrap:anywhere]">
            {currentSentence}
          </p>
        </div>

        {/* Primary Interaction Buttons (TTS & Record) */}
        <div className="flex flex-wrap items-center justify-center gap-4 py-3">
          {/* TTS Button */}
          <button
            type="button"
            onClick={handlePlayTts}
            disabled={isActivelyRecording || audioState === "requesting_microphone"}
            className={`brick-button-secondary px-5 py-3 text-sm font-black flex items-center gap-2 min-w-[140px] justify-center ${
              audioState === "playing_tts" ? "bg-[#FEF3C7] border-amber-600 text-amber-900" : ""
            }`}
          >
            <Volume2 className={`h-5 w-5 ${audioState === "playing_tts" ? "animate-pulse text-[#D97706]" : ""}`} />
            <span>{audioState === "playing_tts" ? "Đang đọc..." : "Nghe câu mẫu"}</span>
          </button>

          {/* Record Button */}
          {audioState === "requesting_microphone" ? (
            <button
              type="button"
              disabled
              className="brick-button-primary px-6 py-3 text-sm font-black flex items-center gap-2 min-w-[140px] justify-center"
            >
              <Mic className="h-5 w-5 animate-pulse" />
              <span>Đang chuẩn bị micro…</span>
            </button>
          ) : isActivelyRecording ? (
            <button
              type="button"
              onClick={handleStopRecording}
              className="brick-button-primary bg-rose-600 text-white hover:bg-rose-700 px-6 py-3 text-sm font-black flex items-center gap-2 min-w-[140px] justify-center animate-pulse"
            >
              <Square className="h-4 w-4 fill-white" />
              <span>Dừng nói</span>
            </button>
          ) : hasCheckedRecorderSupport && !isRecorderSupported ? (
            <button
              type="button"
              disabled
              className="brick-button-secondary px-6 py-3 text-sm font-black flex items-center gap-2 min-w-[140px] justify-center"
            >
              <Mic className="h-5 w-5" />
              <span>Ghi âm không được hỗ trợ</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartRecording}
              className="brick-button-primary px-6 py-3 text-sm font-black flex items-center gap-2 min-w-[140px] justify-center"
            >
              <Mic className="h-5 w-5" />
              <span>{recorderError ? "Thử lại ghi âm" : "Nói lại câu này"}</span>
            </button>
          )}
        </div>

        {/* Live speech feedback or recording indicator */}
        {isActivelyRecording && (
          <div className="rounded-xl border-2 border-[#221C16] bg-[#FEF3C7] p-3.5 text-center space-y-1 animate-pulse">
            <p className="text-xs font-black text-[#92400E]">
              🎙 {isListening && !sttError ? "Đang nhận diện lời nói…" : "Đang ghi âm…"} Hãy đọc câu văn trên rõ ràng.
            </p>
            {(interimTranscript || transcript) && (
              <p className="text-sm font-medium italic text-[#221C16] [overflow-wrap:anywhere]">
                &ldquo;{transcript || interimTranscript}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Evaluation & Text Match Result Section */}
        {audioState === "evaluating" && (
          <div className="rounded-2xl border-2 border-[#221C16] bg-[#FAF6EE] p-4 sm:p-5 space-y-4 shadow-[2px_2px_0px_#221C16]">
            {!isSttSupported || sttError ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <p>
                  {sttError
                    ? "Không thể nhận diện giọng nói cho lượt này. Bản ghi cục bộ vẫn được giữ để bạn nghe lại hoặc thử lại."
                    : "Đã ghi âm. Hãy bấm “Nghe lại giọng mình” bên dưới để tự đối chiếu với câu mẫu."}
                </p>
              </div>
            ) : similarityResult === null ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <p>Chưa nhận được văn bản. Bạn có thể nghe lại bản ghi hoặc nói lại câu này.</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E0D5] pb-2.5">
                <span className="text-xs font-bold text-[#6B6258]">
                  Khớp văn bản nhận diện với câu mẫu:
                </span>
                {similarityResult !== null && (
                  <span
                    className={`text-base font-black px-2.5 py-0.5 rounded-lg border ${
                      similarityResult.similarity >= 85
                        ? "bg-emerald-100 border-emerald-500 text-emerald-800"
                        : similarityResult.similarity >= 60
                        ? "bg-amber-100 border-amber-500 text-amber-800"
                        : "bg-rose-100 border-rose-500 text-rose-800"
                    }`}
                  >
                    {similarityResult.similarity}%
                  </span>
                )}
              </div>
            )}

            {similarityResult !== null && (
              <p className="text-[11px] font-medium leading-5 text-[#8C8275]">
                Chỉ phản ánh mức khớp giữa văn bản nhận diện và câu mẫu; không đánh giá phát âm, giọng hay mức độ thành thạo.
              </p>
            )}

            {/* Word Alignment Visual Diff */}
            {similarityResult && similarityResult.alignment.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-[#8C8275]">Đối chiếu từng từ:</p>
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-white border border-[#E5E0D5] [overflow-wrap:anywhere]">
                  {similarityResult.alignment.map((item, idx) => {
                    if (item.status === "match") {
                      return (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-900"
                          aria-label={`Khớp: ${item.reference || item.spoken}`}
                        >
                          <Check className="h-3 w-3 text-emerald-700" />
                          <span>{item.reference || item.spoken}</span>
                        </span>
                      );
                    }
                    if (item.status === "omission") {
                      return (
                        <span
                          key={idx}
                          title="Từ bị đọc thiếu"
                          className="inline-flex items-center rounded border border-dashed border-rose-400 bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700 line-through opacity-75"
                          aria-label={`Đọc thiếu: ${item.reference}`}
                        >
                          {item.reference}
                        </span>
                      );
                    }
                    if (item.status === "substitution") {
                      return (
                        <span
                          key={idx}
                          title={`Bạn nói: "${item.spoken}"`}
                          className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900 border border-amber-300"
                          aria-label={`Thay thế: câu mẫu ${item.reference}; nhận diện ${item.spoken}`}
                        >
                          <span>{item.reference}</span>
                          <span className="text-[10px] font-normal text-amber-700">({item.spoken})</span>
                        </span>
                      );
                    }
                    // insertion
                    return (
                      <span
                        key={idx}
                        title="Từ nói thừa"
                        className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 italic"
                        aria-label={`Từ thừa: ${item.spoken}`}
                      >
                        +{item.spoken}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* User Speech Transcript */}
            {transcript && (
              <div className="text-xs text-[#6B6258] space-y-0.5">
                <span className="font-bold">Nhận diện được:</span>
                <p className="italic bg-white p-2 rounded-lg border border-[#E5E0D5] text-[#221C16] [overflow-wrap:anywhere]">
                  &ldquo;{transcript}&rdquo;
                </p>
              </div>
            )}

            {/* Action Bar for Current Evaluated Sentence */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                {audioUrl && (
                  <button
                    type="button"
                    onClick={handlePlaySelfAudio}
                    className={`brick-button-secondary px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 ${
                      isPlayingSelfAudio ? "bg-amber-100 border-amber-600 text-amber-900" : ""
                    }`}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{isPlayingSelfAudio ? "Đang phát..." : "Nghe lại giọng mình"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRetry}
                  className="brick-button-secondary px-3 py-1.5 text-xs font-bold flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Thử lại</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="brick-button-primary px-4 py-2 text-xs font-black flex items-center gap-1.5"
              >
                <span>{currentIndex + 1 < totalSentences ? "Câu tiếp theo" : "Xem kết quả"}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Bottom Pagination Controls */}
        <footer className="flex items-center justify-between pt-4 border-t border-[#E5E0D5]">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIndex === 0 || isActivelyRecording || audioState === "requesting_microphone"}
            className="brick-button-secondary px-3 py-1.5 text-xs font-bold flex items-center gap-1 disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Câu trước</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={isActivelyRecording || audioState === "requesting_microphone"}
            className="brick-button-secondary px-3 py-1.5 text-xs font-bold flex items-center gap-1"
          >
            <span>{currentIndex + 1 < totalSentences ? "Bỏ qua" : "Kết thúc"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </footer>
      </div>
    </section>
  );
}
