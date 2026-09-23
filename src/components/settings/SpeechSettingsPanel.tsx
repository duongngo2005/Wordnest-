"use client";

import { useState, useSyncExternalStore } from "react";
import { CheckCircle2, Gauge, Info, RotateCcw, Volume2 } from "lucide-react";
import {
  DEFAULT_SPEECH_PREFERENCES,
  getEnglishSpeechVoices,
  getSpeechPreferences,
  WORDNEST_SPEECH_VOICES,
  saveSpeechPreferences,
  SPEECH_RATES,
  subscribeToEnglishSpeechVoices,
  subscribeToSpeechPreferences,
  type SpeechPreferences,
  type SpeechRate,
} from "@/lib/speech-preferences";
import { speakEnglish } from "@/lib/speech";
import { useToast } from "@/components/ui/ToastProvider";

const PREVIEW_TEXT = "Hello! Let's learn English together.";
const EMPTY_SPEECH_VOICES: SpeechSynthesisVoice[] = [];

const rateLabels: Record<SpeechRate, string> = {
  0.75: "Chậm",
  0.9: "Dễ nghe",
  1: "Bình thường",
  1.15: "Nhanh",
};

export function SpeechSettingsPanel() {
  const preferences = useSyncExternalStore(
    subscribeToSpeechPreferences,
    getSpeechPreferences,
    () => DEFAULT_SPEECH_PREFERENCES
  );
  const voices = useSyncExternalStore(
    subscribeToEnglishSpeechVoices,
    getEnglishSpeechVoices,
    () => EMPTY_SPEECH_VOICES
  );
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const { error, success } = useToast();

  const updatePreferences = (nextPreferences: SpeechPreferences) => {
    saveSpeechPreferences(nextPreferences);
  };

  const handleVoiceChange = (voiceURI: string) => {
    updatePreferences({ ...preferences, voiceURI });
  };

  const handleRateChange = (rate: SpeechRate) => {
    updatePreferences({ ...preferences, rate });
  };

  const handlePreview = () => {
    if (isPlayingPreview) return;
    setIsPlayingPreview(true);

    speakEnglish(
      PREVIEW_TEXT,
      () => setIsPlayingPreview(true),
      () => setIsPlayingPreview(false),
      () => {
        setIsPlayingPreview(false);
        error("Không thể phát âm thanh", {
          description: "Hãy kiểm tra âm lượng và cài đặt âm thanh của thiết bị.",
        });
      }
    );
  };

  const resetPreferences = () => {
    updatePreferences(DEFAULT_SPEECH_PREFERENCES);
    success("Đã khôi phục thiết lập mặc định");
  };

  return (
    <section className="brick-card overflow-hidden bg-[#FFFDF9]">
      <div className="border-b-2 border-[#221C16] bg-[#FEF3C7] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] shadow-[2px_2px_0px_#221C16]">
            <Volume2 className="h-5 w-5 text-[#E06B43]" strokeWidth={2.5} />
          </span>
          <div>
            <h2 className="text-base font-black text-[#221C16]">Giọng đọc tiếng Anh</h2>
            <p className="mt-0.5 text-xs font-bold text-[#6B6258]">
              Áp dụng trên thiết bị này.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        <label className="block space-y-2" htmlFor="speech-voice">
          <span className="block text-sm font-black text-[#221C16]">Chọn giọng</span>
          <select
            id="speech-voice"
            value={preferences.voiceURI ?? ""}
            onChange={(event) => handleVoiceChange(event.target.value)}
            className="min-h-11 w-full rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3 text-sm font-bold text-[#221C16] shadow-[2px_2px_0px_#221C16] outline-none focus:ring-2 focus:ring-[#E06B43]"
          >
            <optgroup label="Giọng WordNest">
              {WORDNEST_SPEECH_VOICES.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </optgroup>
            {voices.length > 0 ? (
              <optgroup label="Giọng thiết bị">
                {voices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          {voices.length === 0 ? (
            <p className="flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-[#0284C7]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Có 4 giọng WordNest. Giọng thiết bị sẽ hiện khi trình duyệt tải xong.
            </p>
          ) : (
            <p className="text-xs font-bold text-[#6B6258]">
              {voices.length} giọng thiết bị có sẵn. Chọn giọng WordNest để phát ổn định trên mọi thiết bị.
            </p>
          )}
        </label>

        <fieldset className="space-y-2">
          <legend className="flex items-center gap-2 text-sm font-black text-[#221C16]">
            <Gauge className="h-4 w-4 text-[#0284C7]" />
            Tốc độ đọc
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tốc độ đọc">
            {SPEECH_RATES.map((rate) => {
              const isSelected = preferences.rate === rate;
              return (
                <button
                  key={rate}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${rateLabels[rate]} ${rate}×`}
                  onClick={() => handleRateChange(rate)}
                  className={`min-h-12 rounded-xl border-2 px-3 py-2 text-left text-xs font-black transition-colors focus:outline-none focus:ring-2 focus:ring-[#E06B43] ${
                    isSelected
                      ? "border-[#221C16] bg-[#DDF5F1] shadow-[2px_2px_0px_#221C16]"
                      : "border-[#C9BFB1] bg-[#FFFDF9] hover:border-[#221C16] hover:bg-[#FAF6EE]"
                  }`}
                >
                  <span className="block text-[#221C16]">{rateLabels[rate]}</span>
                  <span className="mt-0.5 block text-[11px] font-bold text-[#6B6258]">{rate}×</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 border-t-2 border-dashed border-[#C9BFB1] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPlayingPreview}
            className="brick-button-primary gap-2 px-4 text-sm disabled:translate-x-0"
          >
            <Volume2 className={`h-4 w-4 ${isPlayingPreview ? "speaking-pulse" : ""}`} />
            {isPlayingPreview ? "Đang đọc…" : "Nghe thử"}
          </button>
          <button
            type="button"
            onClick={resetPreferences}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold text-[#6B6258] transition-colors hover:bg-[#F3EBDD] hover:text-[#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Khôi phục mặc định
          </button>
        </div>

        <p className="flex items-center gap-2 rounded-xl border border-[#8DD3C7] bg-[#F0FDFA] p-3 text-xs font-bold text-[#166534]">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" />
          <span>Đã lưu trên thiết bị này.</span>
        </p>
      </div>
    </section>
  );
}
