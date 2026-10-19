"use client";

import { useState } from "react";
import type { OnlineTimeAnalytics } from "@/services/vocabulary/progress-service";

interface OnlineTimePanelProps {
  onlineTime: OnlineTimeAnalytics;
}

function formatOnlineDuration(seconds: number): string {
  const wholeMinutes = Math.floor(seconds / 60);
  if (wholeMinutes < 1) return seconds > 0 ? "< 1 phút" : "0 phút";

  const hours = Math.floor(wholeMinutes / 60);
  const minutes = wholeMinutes % 60;
  if (hours === 0) return `${wholeMinutes} phút`;
  return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

export function OnlineTimePanel({ onlineTime }: OnlineTimePanelProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedDay = onlineTime.days.find((day) => day.date === selectedDate) ?? null;
  const hasActivity = onlineTime.totalSeconds > 0;
  const maximum = Math.max(1, ...onlineTime.days.map((day) => day.activeSeconds));

  return (
    <section
      className="wn-insight-panel wn-paper-surface min-w-0 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 shadow-[3px_3px_0px_#221C16] sm:p-5"
      aria-labelledby="online-time-heading"
      data-testid="online-time-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="online-time-heading" className="text-lg font-black text-[#221C16]">
            Thời gian sử dụng
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-[#6B6258]">Khi WordNest đang mở và hoạt động.</p>
        </div>
        <dl className="grid min-w-full grid-cols-3 gap-3 sm:min-w-0 sm:gap-5">
          <div>
            <dt className="text-[10px] font-black uppercase tracking-wide text-[#6B6258]">Hôm nay</dt>
            <dd className="mt-0.5 font-mono text-base font-black text-[#221C16]">
              {formatOnlineDuration(onlineTime.todaySeconds)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-black uppercase tracking-wide text-[#6B6258]">Tổng 14 ngày</dt>
            <dd className="mt-0.5 font-mono text-base font-black text-[#221C16]">
              {formatOnlineDuration(onlineTime.totalSeconds)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-black uppercase tracking-wide text-[#6B6258]">Ngày hoạt động</dt>
            <dd className="mt-0.5 font-mono text-base font-black text-[#221C16]">
              {onlineTime.activeDays} ngày
            </dd>
          </div>
        </dl>
      </div>

      {hasActivity ? (
        <figure className="mt-5" aria-describedby="online-time-selection-instruction">
          <figcaption className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-black text-[#221C16]">14 ngày gần đây</h3>
            <p id="online-time-selection-instruction" className="text-xs font-semibold text-[#6B6258]">
              Chọn cột để xem ngày đó.
            </p>
          </figcaption>
          <ul
            className="mt-3 grid grid-cols-7 gap-x-1.5 gap-y-3 sm:grid-cols-14"
            aria-label="Thời gian sử dụng trong 14 ngày gần đây"
          >
            {onlineTime.days.map((day) => {
              const isSelected = selectedDay?.date === day.date;
              const height = day.activeSeconds > 0 ? `${Math.max(8, (day.activeSeconds / maximum) * 100)}%` : "2px";

              return (
                <li key={day.date} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    aria-pressed={isSelected}
                    aria-label={`${day.label}: ${formatOnlineDuration(day.activeSeconds)}. Chọn để xem thời lượng ngày này.`}
                    className={`flex min-h-24 w-full flex-col items-center justify-end rounded-md px-1 pb-1.5 pt-1 transition-colors hover:bg-[#FAF6EE] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 ${
                      isSelected ? "bg-[var(--accent-soft)]" : ""
                    }`}
                    data-testid={`online-time-day-${day.date}`}
                  >
                    <span className="flex h-16 w-full items-end border-b border-[#C9BFB1]" aria-hidden="true">
                      <span
                        className={`mx-auto w-full max-w-5 rounded-t-sm ${
                          day.activeSeconds > 0 ? "bg-[var(--accent)]" : "bg-[#DCD3C5]"
                        }`}
                        style={{ height }}
                      />
                    </span>
                    <time dateTime={day.date} className="mt-1.5 font-mono text-[10px] font-bold text-[#6B6258]" aria-hidden="true">
                      {day.date.slice(-2)}
                    </time>
                  </button>
                </li>
              );
            })}
          </ul>
          <div aria-live="polite" aria-atomic="true" className="mt-3 min-h-5 text-xs font-semibold text-[#6B6258]">
            {selectedDay ? (
              <p>
                <time dateTime={selectedDay.date} className="font-black text-[#221C16]">
                  {selectedDay.label}
                </time>
                {": "}
                <span className="font-mono font-black text-[#221C16]">{formatOnlineDuration(selectedDay.activeSeconds)}</span>
              </p>
            ) : null}
          </div>
        </figure>
      ) : (
        <p className="mt-5 text-sm font-bold text-[#6B6258]">Chưa có thời gian sử dụng được ghi nhận.</p>
      )}
    </section>
  );
}
