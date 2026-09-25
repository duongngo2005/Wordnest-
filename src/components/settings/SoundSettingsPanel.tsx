"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2, Music, Play, Volume2, VolumeX } from "lucide-react";
import {
  DEFAULT_UI_SOUND_PREFERENCES,
  getUISoundPreferences,
  saveUISoundPreferences,
  subscribeToUISoundPreferences,
} from "@/lib/ui-sound-preferences";
import { playUISound } from "@/lib/ui-sound";
import { useToast } from "@/components/ui/ToastProvider";

export function SoundSettingsPanel() {
  const preferences = useSyncExternalStore(
    subscribeToUISoundPreferences,
    getUISoundPreferences,
    () => DEFAULT_UI_SOUND_PREFERENCES
  );
  const { info } = useToast();

  const handleToggle = (enabled: boolean) => {
    saveUISoundPreferences({ ...preferences, enabled });
    if (enabled) {
      // Provide immediate feedback on enable
      setTimeout(() => playUISound("softTap"), 50);
    } else {
      info("Đã tắt âm thanh giao diện.");
    }
  };

  const handleTestSound = (type: "softTap" | "paperFlip" | "success") => {
    if (!preferences.enabled) {
      info("Hãy bật âm thanh giao diện để nghe thử.");
      return;
    }
    playUISound(type);
  };

  return (
    <section className="brick-card overflow-hidden bg-[#FFFDF9]" aria-labelledby="sound-settings-heading">
      <div className="border-b-2 border-[#221C16] bg-[#FEF3C7] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] shadow-[2px_2px_0px_#221C16]"
            aria-hidden="true"
          >
            <Music className="h-5 w-5 text-[#E06B43]" strokeWidth={2.5} />
          </span>
          <div>
            <h2 id="sound-settings-heading" className="text-base font-black text-[#221C16]">
              Âm thanh giao diện
            </h2>
            <p className="mt-0.5 text-xs font-bold text-[#6B6258]">
              Hiệu ứng vật lý khi thao tác trên thiết bị này.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="block text-sm font-black text-[#221C16]">
              Phản hồi âm thanh
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-[#6B6258]">
              Âm thanh ngắn khi bấm nút, lật thẻ và hoàn thành bài học.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleToggle(true)}
              aria-pressed={preferences.enabled}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-[#221C16] px-3.5 py-2 text-xs font-black transition-all ${
                preferences.enabled
                  ? "bg-[#DCFCE7] text-[#15803D] shadow-[2px_2px_0px_#221C16]"
                  : "bg-[#FFFDF9] text-[#6B6258] hover:bg-[#FAF6EE]"
              }`}
            >
              <Volume2 className="h-4 w-4" strokeWidth={2.5} />
              <span>Bật</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggle(false)}
              aria-pressed={!preferences.enabled}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-[#221C16] px-3.5 py-2 text-xs font-black transition-all ${
                !preferences.enabled
                  ? "bg-[#FEE2E2] text-[#B91C1C] shadow-[2px_2px_0px_#221C16]"
                  : "bg-[#FFFDF9] text-[#6B6258] hover:bg-[#FAF6EE]"
              }`}
            >
              <VolumeX className="h-4 w-4" strokeWidth={2.5} />
              <span>Tắt</span>
            </button>
          </div>
        </div>

        {/* Test sounds area */}
        <div className="rounded-xl border-2 border-dashed border-[#DCD3C5] bg-[#FAF6EE] p-4">
          <p className="text-xs font-black uppercase tracking-wider text-[#6B6258]">
            Nghe thử hiệu ứng
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTestSound("softTap")}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[1.5px_1.5px_0px_#221C16] transition-transform active:translate-y-0.5 hover:bg-[#FAF6EE]"
            >
              <Play className="h-3.5 w-3.5 text-[#E06B43]" fill="currentColor" />
              <span>Chạm nhẹ</span>
            </button>

            <button
              type="button"
              onClick={() => handleTestSound("paperFlip")}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[1.5px_1.5px_0px_#221C16] transition-transform active:translate-y-0.5 hover:bg-[#FAF6EE]"
            >
              <Play className="h-3.5 w-3.5 text-[#0284C7]" fill="currentColor" />
              <span>Lật giấy</span>
            </button>

            <button
              type="button"
              onClick={() => handleTestSound("success")}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[1.5px_1.5px_0px_#221C16] transition-transform active:translate-y-0.5 hover:bg-[#FAF6EE]"
            >
              <Play className="h-3.5 w-3.5 text-[#15803D]" fill="currentColor" />
              <span>Thành công</span>
            </button>
          </div>
        </div>

        <p className="flex items-center gap-2 rounded-xl border border-[#8DD3C7] bg-[#F0FDFA] p-3 text-xs font-bold text-[#166534]" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" aria-hidden="true" />
          <span>Đã lưu trên thiết bị này.</span>
        </p>
      </div>
    </section>
  );
}
