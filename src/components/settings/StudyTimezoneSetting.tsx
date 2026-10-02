"use client";

import React, { useSyncExternalStore, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Check, Clock } from "lucide-react";
import {
  COMMON_STUDY_TIMEZONES,
  DEFAULT_STUDY_TIMEZONE,
  formatTimezoneOffsetLabel,
} from "@/lib/study-timezone";
import {
  getClientTimezonePreference,
  saveClientTimezonePreference,
  subscribeToTimezonePreferences,
  DEFAULT_STORED_PREFERENCE,
  getDeviceTimezone,
  type TimezoneSelectionMode,
} from "@/lib/study-timezone-client";

const subscribeToNothing = () => () => {};

export function StudyTimezoneSetting() {
  const router = useRouter();
  const [savedFeedback, setSavedFeedback] = useState(false);
  // Keep the server's initial markup deterministic. The actual device timezone
  // is presentation-only and can safely be filled in after hydration.
  const deviceTz = useSyncExternalStore(
    subscribeToNothing,
    getDeviceTimezone,
    () => DEFAULT_STUDY_TIMEZONE
  );

  const preference = useSyncExternalStore(
    subscribeToTimezonePreferences,
    getClientTimezonePreference,
    () => DEFAULT_STORED_PREFERENCE
  );

  const mode = preference.mode;
  const selectedTz = preference.resolvedTimezone;
  const currentOffset = formatTimezoneOffsetLabel(selectedTz);

  const handleModeChange = (newMode: TimezoneSelectionMode) => {
    if (newMode === "device") {
      saveClientTimezonePreference("device");
      triggerSaved();
    } else {
      saveClientTimezonePreference("custom", selectedTz);
      triggerSaved();
    }
  };

  const handleTimezoneSelect = (tz: string) => {
    saveClientTimezonePreference("custom", tz);
    triggerSaved();
  };

  const triggerSaved = () => {
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
    router.refresh();
  };

  return (
    <section className="brick-card bg-[#FFFDF9] p-4 sm:p-6" aria-labelledby="timezone-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.5} />
            <h2 id="timezone-heading" className="text-lg font-black text-[#221C16]">
              Múi giờ ngày học
            </h2>
          </div>
          <p className="mt-1 text-xs font-semibold text-[#6B6258] sm:text-sm">
            Dùng để xác định mốc sang ngày mới, lịch hoạt động và chuỗi ôn tập FSRS.
          </p>
        </div>

        {savedFeedback && (
          <span className="wn-stamp flex items-center gap-1 text-[11px] text-[#15803D] border-[#15803D]">
            <Check className="h-3 w-3" />
            <span>Đã lưu</span>
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {/* Quick Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleModeChange("device")}
            className={`rounded-xl border-2 px-3 py-1.5 text-xs font-black transition-all ${
              mode === "device"
                ? "border-[#221C16] bg-[#221C16] text-[#FFFDF9] shadow-[2px_2px_0px_#221C16]"
                : "border-[#DCD3C5] bg-[#FAF6EE] text-[#6B6258] hover:border-[#221C16] hover:text-[#221C16]"
            }`}
          >
            Theo thiết bị ({deviceTz})
          </button>

          <button
            type="button"
            onClick={() => handleModeChange("custom")}
            className={`rounded-xl border-2 px-3 py-1.5 text-xs font-black transition-all ${
              mode === "custom"
                ? "border-[#221C16] bg-[#221C16] text-[#FFFDF9] shadow-[2px_2px_0px_#221C16]"
                : "border-[#DCD3C5] bg-[#FAF6EE] text-[#6B6258] hover:border-[#221C16] hover:text-[#221C16]"
            }`}
          >
            Tùy chọn thủ công
          </button>
        </div>

        {/* Timezone Selection Dropdown */}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] items-center">
          <div className="relative">
            <label htmlFor="study-timezone-select" className="sr-only">
              Chọn múi giờ
            </label>
            <select
              id="study-timezone-select"
              value={selectedTz}
              onChange={(e) => handleTimezoneSelect(e.target.value)}
              className="w-full appearance-none rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3.5 py-2 text-xs font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] pr-8 cursor-pointer"
            >
              {COMMON_STUDY_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label} ({tz.offsetLabel})
                </option>
              ))}
              {!COMMON_STUDY_TIMEZONES.some((tz) => tz.value === selectedTz) && (
                <option value={selectedTz}>
                  {selectedTz} ({currentOffset})
                </option>
              )}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#6B6258] px-1">
            <Clock className="h-3.5 w-3.5 text-[#8C8275]" />
            <span>Múi giờ hiện tại: {currentOffset || "GMT+7"}</span>
          </div>
        </div>

        <p className="text-[11px] font-semibold text-[#8C8275]">
          Lưu ý: Thay đổi múi giờ sẽ nhóm lại dữ liệu ôn tập theo ngày địa phương tương ứng mà không làm thay đổi thời gian gốc của bản ghi.
        </p>
      </div>
    </section>
  );
}
