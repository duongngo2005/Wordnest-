"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Gauge, Info, LoaderCircle, RotateCcw, Volume2 } from "lucide-react";
import {
  DEFAULT_SPEECH_PREFERENCES,
  getEnglishSpeechVoices,
  getSpeechPreferences,
  isCloudSpeechVoice,
  saveSpeechPreferences,
  SPEECH_RATES,
  subscribeToEnglishSpeechVoices,
  subscribeToSpeechPreferences,
  type SpeechPreferences,
  type SpeechRate,
} from "@/lib/speech-preferences";
import { CLOUD_TTS_VOICES } from "@/lib/tts/voice-catalog";
import { speakEnglish } from "@/lib/speech";
import { useToast } from "@/components/ui/ToastProvider";

const PREVIEW_TEXT = "Small steps every day make a big difference.";
const EMPTY_SPEECH_VOICES: SpeechSynthesisVoice[] = [];
const MAX_VISIBLE_SYSTEM_VOICES = 12;

const rateLabels: Record<SpeechRate, string> = {
  0.75: "0.75×",
  0.9: "0.9×",
  1: "1×",
  1.15: "1.15×",
};

type VoiceChoice = {
  id: string;
  name: string;
  meta: string;
  voiceURI: string | null;
  source: "cloud" | "system";
};

export function SpeechSettingsPanel() {
  const preferences = useSyncExternalStore(
    subscribeToSpeechPreferences,
    getSpeechPreferences,
    () => DEFAULT_SPEECH_PREFERENCES
  );
  const systemVoices = useSyncExternalStore(
    subscribeToEnglishSpeechVoices,
    getEnglishSpeechVoices,
    () => EMPTY_SPEECH_VOICES
  );
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [isCheckingCloud, setIsCheckingCloud] = useState(true);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const { error, info, success } = useToast();

  useEffect(() => {
    let active = true;

    void fetch("/api/tts/voices", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return false;
        const data: unknown = await response.json();
        return isCloudAvailability(data);
      })
      .then((enabled) => {
        if (!active) return;
        setCloudEnabled(enabled);
      })
      .catch(() => {
        if (active) setCloudEnabled(false);
      })
      .finally(() => {
        if (active) setIsCheckingCloud(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const cloudVoices: VoiceChoice[] = CLOUD_TTS_VOICES.map((voice) => ({
    id: voice.id,
    name: voice.name,
    meta: `${voice.accent} · ${voice.gender}`,
    voiceURI: voice.id,
    source: "cloud",
  }));
  const visibleSystemVoices: VoiceChoice[] = [
    {
      id: "system:default",
      name: "Mặc định thiết bị",
      meta: "Tiếng Anh · Hệ thống",
      voiceURI: null,
      source: "system",
    },
    ...systemVoices.slice(0, MAX_VISIBLE_SYSTEM_VOICES).map((voice) => ({
      id: `system:${voice.voiceURI}`,
      name: voice.name,
      meta: voice.lang.replace("_", "-"),
      voiceURI: voice.voiceURI,
      source: "system" as const,
    })),
  ];

  const updatePreferences = (nextPreferences: SpeechPreferences) => saveSpeechPreferences(nextPreferences);
  const handleVoiceChange = (voiceURI: string | null) => {
    updatePreferences({ ...preferences, voiceURI });
  };
  const handleRateChange = (rate: SpeechRate) => updatePreferences({ ...preferences, rate });

  const handlePreview = (voice: VoiceChoice) => {
    if (previewingVoiceId) return;
    setPreviewingVoiceId(voice.id);

    speakEnglish(
      PREVIEW_TEXT,
      () => setPreviewingVoiceId(voice.id),
      () => setPreviewingVoiceId(null),
      () => {
        setPreviewingVoiceId(null);
        error("Không thể phát âm thanh", { description: "Kiểm tra âm lượng rồi thử lại." });
      },
      {
        voiceURI: voice.voiceURI,
        onCloudFallback: () => info("Đang dùng giọng hệ thống."),
      }
    );
  };

  const resetPreferences = () => {
    updatePreferences(DEFAULT_SPEECH_PREFERENCES);
    success("Đã khôi phục thiết lập mặc định");
  };

  return (
    <section className="brick-card overflow-hidden bg-[#FFFDF9]" aria-labelledby="speech-settings-heading">
      <div className="border-b-2 border-[#221C16] bg-[#FEF3C7] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] shadow-[2px_2px_0px_#221C16]" aria-hidden="true">
            <Volume2 className="h-5 w-5 text-[#E06B43]" strokeWidth={2.5} />
          </span>
          <div>
            <h2 id="speech-settings-heading" className="text-base font-black text-[#221C16]">Giọng đọc</h2>
            <p className="mt-0.5 text-xs font-bold text-[#6B6258]">Áp dụng trên thiết bị này.</p>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        {cloudEnabled ? (
          <VoiceGroup
            legend="WordNest"
            description="Giọng tiếng Anh tự nhiên, nghe thử trước khi chọn."
            choices={cloudVoices}
            selectedVoiceURI={preferences.voiceURI}
            previewingVoiceId={previewingVoiceId}
            onSelect={handleVoiceChange}
            onPreview={handlePreview}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-[#C9BFB1] bg-[#FAF6EE] p-3 text-xs font-bold text-[#6B6258]" role="status">
            {isCheckingCloud ? "Đang kiểm tra giọng WordNest…" : "Giọng WordNest chưa được bật trên máy chủ này."}
          </div>
        )}

        <VoiceGroup
          legend="Hệ thống"
          description={
            systemVoices.length > MAX_VISIBLE_SYSTEM_VOICES
              ? `Hiện ${MAX_VISIBLE_SYSTEM_VOICES} trong ${systemVoices.length} giọng tiếng Anh đầu tiên của thiết bị.`
              : "Dùng giọng có sẵn trên iPhone hoặc trình duyệt."
          }
          choices={visibleSystemVoices}
          selectedVoiceURI={isCloudSpeechVoice(preferences.voiceURI) ? "__cloud__" : preferences.voiceURI}
          previewingVoiceId={previewingVoiceId}
          onSelect={handleVoiceChange}
          onPreview={handlePreview}
        />

        <fieldset className="wn-voice-section">
          <legend className="flex items-center gap-2 text-sm font-black text-[#221C16]">
            <Gauge className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
            Tốc độ
          </legend>
          <div className="wn-rate-grid">
            {SPEECH_RATES.map((rate) => {
              const id = `speech-rate-${rate}`;
              return (
                <div className="wn-rate-choice" key={rate}>
                  <input
                    id={id}
                    type="radio"
                    name="speech-rate"
                    checked={preferences.rate === rate}
                    onChange={() => handleRateChange(rate)}
                  />
                  <label htmlFor={id}>{rateLabels[rate]}</label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 border-t-2 border-dashed border-[#C9BFB1] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-[#6B6258]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0284C7]" aria-hidden="true" />
            Tốc độ áp dụng khi phát, nên không tạo lại audio đã lưu.
          </p>
          <button
            type="button"
            onClick={resetPreferences}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold text-[#6B6258] transition-colors hover:bg-[#F3EBDD] hover:text-[#221C16]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Khôi phục mặc định
          </button>
        </div>

        <p className="flex items-center gap-2 rounded-xl border border-[#8DD3C7] bg-[#F0FDFA] p-3 text-xs font-bold text-[#166534]" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" aria-hidden="true" />
          <span>Đã lưu trên thiết bị này.</span>
        </p>
      </div>
    </section>
  );
}

function VoiceGroup({
  legend,
  description,
  choices,
  selectedVoiceURI,
  previewingVoiceId,
  onSelect,
  onPreview,
}: {
  legend: string;
  description: string;
  choices: VoiceChoice[];
  selectedVoiceURI: string | null;
  previewingVoiceId: string | null;
  onSelect: (voiceURI: string | null) => void;
  onPreview: (voice: VoiceChoice) => void;
}) {
  return (
    <fieldset className="wn-voice-section">
      <legend className="text-sm font-black uppercase tracking-[0.12em] text-[#221C16]">{legend}</legend>
      <p className="text-xs font-semibold leading-relaxed text-[#6B6258]">{description}</p>
      <div className="wn-voice-grid">
        {choices.map((voice) => {
          const inputId = `speech-voice-${voice.id.replace(/[^a-z0-9]/gi, "-")}`;
          const isPreviewing = previewingVoiceId === voice.id;
          return (
            <div className={`wn-voice-choice ${voice.source === "system" ? "wn-voice-choice--system" : ""}`} key={voice.id}>
              <input
                id={inputId}
                type="radio"
                name="speech-voice"
                checked={selectedVoiceURI === voice.voiceURI}
                onChange={() => onSelect(voice.voiceURI)}
              />
              <label htmlFor={inputId}>
                <span className="wn-voice-choice__name">{voice.name}</span>
                <span className="wn-voice-choice__meta">{voice.meta}</span>
              </label>
              <button
                type="button"
                className="wn-voice-preview"
                onClick={() => onPreview(voice)}
                disabled={previewingVoiceId !== null}
                aria-label={`Nghe thử ${voice.name}`}
                aria-busy={isPreviewing}
              >
                {isPreviewing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function isCloudAvailability(value: unknown): boolean {
  return typeof value === "object" && value !== null && "enabled" in value && value.enabled === true;
}
