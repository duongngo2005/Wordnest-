"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { HeatmapDayCell, ReviewActivityData } from "@/services/vocabulary/review-activity-service";
import { ReviewStreakSummary } from "./ReviewStreakSummary";

interface ReviewActivityHeatmapProps {
  activityData: ReviewActivityData;
}

const WEEKDAY_LABELS = ["T.2", "", "T.4", "", "T.6", "", "CN"];

const INTENSITY_CLASSES: Record<number, string> = {
  0: "bg-[#FAF6EE] border-[#DCD3C5]/80 hover:border-[#221C16]",
  1: "bg-[#FFEDD5] border-[#FDBA74] hover:border-[#221C16]",
  2: "bg-[#FCD34D] border-[#F59E0B] hover:border-[#221C16]",
  3: "bg-[var(--accent)] border-[var(--accent-strong)] hover:border-[#221C16]",
  4: "bg-[var(--accent-strong)] border-[var(--accent-ink)] hover:border-[#221C16]",
};

export function ReviewActivityHeatmap({ activityData }: ReviewActivityHeatmapProps) {
  const [period, setPeriod] = useState<"3m" | "1y">("1y");
  const [selectedDay, setSelectedDay] = useState<HeatmapDayCell | null>(null);

  const { weeks, metrics } = activityData;

  // Filter weeks based on selected period:
  // 1y: all weeks (~52 weeks)
  // 3m: last 14 weeks (~3 months)
  const visibleWeeks = useMemo(() => {
    if (period === "3m") {
      return weeks.slice(-14);
    }
    return weeks;
  }, [weeks, period]);

  const visibleDays = useMemo(() => {
    return visibleWeeks.flatMap((w) => w.days);
  }, [visibleWeeks]);

  // Recalculate active days in currently visible period
  const activeDaysInPeriod = useMemo(() => {
    return visibleDays.filter((d) => !d.isFuture && d.count > 0).length;
  }, [visibleDays]);

  const totalReviewsInPeriod = useMemo(() => {
    return visibleDays.reduce((sum, d) => sum + (d.isFuture ? 0 : d.count), 0);
  }, [visibleDays]);

  const currentMetrics = useMemo(() => ({
    ...metrics,
    activeDaysInPeriod,
    totalReviewsInPeriod,
  }), [metrics, activeDaysInPeriod, totalReviewsInPeriod]);

  const periodLabel = period === "3m" ? "3 tháng qua" : "1 năm qua";

  return (
    <section
      className="wn-insight-panel wn-paper-surface min-w-0 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-4 sm:p-6 shadow-[3px_3px_0px_#221C16]"
      aria-labelledby="review-activity-heading"
    >
      {/* Header and Period Controls */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b-2 border-[#221C16]/10">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="review-activity-heading" className="text-base font-black text-[#221C16] sm:text-lg">
              Hoạt động ôn tập
            </h2>
            <span className="wn-stamp text-[10px] text-[var(--accent)] border-[var(--accent)]">
              LỊCH SỬ FSRS
            </span>
          </div>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-0.5 shadow-[1.5px_1.5px_0px_#221C16]">
          <button
            type="button"
            onClick={() => setPeriod("3m")}
            className={`rounded-lg px-2.5 py-1 text-xs font-black transition-all ${
              period === "3m"
                ? "bg-[#221C16] text-[#FFFDF9] shadow-[1px_1px_0px_#221C16]"
                : "text-[#6B6258] hover:text-[#221C16]"
            }`}
          >
            3 tháng
          </button>
          <button
            type="button"
            onClick={() => setPeriod("1y")}
            className={`rounded-lg px-2.5 py-1 text-xs font-black transition-all ${
              period === "1y"
                ? "bg-[#221C16] text-[#FFFDF9] shadow-[1px_1px_0px_#221C16]"
                : "text-[#6B6258] hover:text-[#221C16]"
            }`}
          >
            1 năm
          </button>
        </div>
      </div>

      {/* Streak and Consistency Highlights */}
      <div className="mt-4">
        <ReviewStreakSummary metrics={currentMetrics} periodLabel={periodLabel} />
      </div>

      {/* Heatmap Matrix Display */}
      <div className="mt-6">
        <div className="relative overflow-x-auto pb-2 scrollbar-thin">
          <div className="inline-block min-w-full">
            {/* Month Labels Row */}
            <div className="flex items-center gap-1 pl-7 pb-1 text-[10px] font-mono font-bold text-[#8C8275]">
              {visibleWeeks.map((week, idx) => (
                <div
                  key={idx}
                  className="w-3.5 sm:w-4 shrink-0 text-left truncate"
                >
                  {week.monthLabel || ""}
                </div>
              ))}
            </div>

            {/* Grid Container */}
            <div className="flex gap-1">
              {/* Day of Week Labels (T2 to CN) */}
              <div className="flex flex-col justify-between py-0.5 text-[10px] font-mono font-bold text-[#8C8275] w-6 shrink-0 text-right pr-1 select-none">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <span key={idx} className="h-3.5 sm:h-4 leading-3.5 sm:leading-4">
                    {label}
                  </span>
                ))}
              </div>

              {/* Weekly Columns */}
              <div
                role="grid"
                aria-label={`Lịch hoạt động ôn tập trong ${periodLabel}`}
                className="flex gap-1"
              >
                {visibleWeeks.map((week) => (
                  <div key={week.weekIndex} role="row" className="flex flex-col gap-1">
                    {week.days.map((day) => {
                      const isSelected = selectedDay?.dateKey === day.dateKey;
                      const intensityClass = day.isFuture
                        ? "bg-[#FAF6EE]/50 border-dashed border-[#DCD3C5]/60 opacity-40 cursor-not-allowed"
                        : INTENSITY_CLASSES[day.intensity];

                      const todayIndicator = day.isToday
                        ? "ring-2 ring-[#221C16] ring-offset-1 z-10"
                        : "";

                      const selectedIndicator = isSelected
                        ? "outline-2 outline-[var(--accent)] outline-offset-1 z-20 scale-125"
                        : "";

                      return (
                        <button
                          key={day.dateKey}
                          type="button"
                          role="gridcell"
                          disabled={day.isFuture}
                          onClick={() => setSelectedDay(day)}
                          aria-label={`${day.displayDate}: ${day.count} lượt ôn`}
                          aria-selected={isSelected}
                          className={`h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-xs sm:rounded-sm border transition-all ${intensityClass} ${todayIndicator} ${selectedIndicator}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend and Legend Scale */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-[#6B6258]">
          <div className="flex items-center gap-1.5 font-bold">
            <span>Ít</span>
            <div className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-xs border border-[#DCD3C5] bg-[#FAF6EE]" aria-hidden="true" />
              <span className="h-3 w-3 rounded-xs border border-[#FDBA74] bg-[#FFEDD5]" aria-hidden="true" />
              <span className="h-3 w-3 rounded-xs border border-[#F59E0B] bg-[#FCD34D]" aria-hidden="true" />
              <span className="h-3 w-3 rounded-xs border border-[var(--accent-strong)] bg-[var(--accent)]" aria-hidden="true" />
              <span className="h-3 w-3 rounded-xs border border-[var(--accent-ink)] bg-[var(--accent-strong)]" aria-hidden="true" />
            </div>
            <span>Nhiều</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-xs border-2 border-[#221C16]" />
              <span>Hôm nay</span>
            </span>
            <span className="font-mono text-[#8C8275]">
              {totalReviewsInPeriod} lượt ôn · {activeDaysInPeriod} ngày
            </span>
          </div>
        </div>

        {/* Cell Detail Note (Desktop & Mobile) */}
        {selectedDay && (
          <div
            role="region"
            aria-label="Chi tiết ngày đã chọn"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] p-3 text-xs shadow-[2px_2px_0px_#221C16]"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[#221C16]">
                  {selectedDay.displayDate}
                </span>
                {selectedDay.isToday && (
                  <span className="wn-stamp text-[10px] text-[#15803D] border-[#15803D]">
                    HÔM NAY
                  </span>
                )}
                {selectedDay.count > 0 ? (
                  <span className="rounded-md bg-[#DCFCE7] px-1.5 py-0.5 text-[10px] font-black text-[#15803D]">
                    ✓ Ngày có ôn tập
                  </span>
                ) : (
                  <span className="rounded-md bg-[#FAF6EE] px-1.5 py-0.5 text-[10px] font-bold text-[#8C8275]">
                    Không có lượt ôn
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[#6B6258]">
                <span className="font-bold text-[#221C16]">
                  <strong className="font-mono font-black text-sm">{selectedDay.count}</strong> lượt ôn
                </span>

                {selectedDay.count > 0 && (
                  <span className="font-mono text-[11px] text-[#8C8275]">
                    Lại {selectedDay.ratings.again} · Khó {selectedDay.ratings.hard} · Tốt {selectedDay.ratings.good} · Dễ {selectedDay.ratings.easy}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              aria-label="Đóng chi tiết ngày"
              className="rounded-lg border border-[#221C16] bg-[#FFFDF9] p-1 text-[#6B6258] hover:text-[#221C16] hover:bg-[#FAF6EE] shadow-[1px_1px_0px_#221C16]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Accessible Alternative Table */}
        <details className="mt-4 text-xs font-bold text-[#6B6258]">
          <summary className="cursor-pointer underline decoration-dashed underline-offset-4 hover:text-[#221C16]">
            Xem dữ liệu hoạt động theo bảng
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[#DCD3C5] bg-[#FAF6EE] p-2.5">
            <table className="w-full text-left text-xs font-normal">
              <thead>
                <tr className="border-b border-[#DCD3C5] text-[#221C16] font-bold">
                  <th className="py-1">Ngày</th>
                  <th className="py-1 text-right">Số lượt ôn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCD3C5]/60 font-mono">
                {visibleDays
                  .filter((d) => !d.isFuture && d.count > 0)
                  .map((d) => (
                    <tr key={d.dateKey} className="hover:bg-[#FFFDF9]">
                      <td className="py-1 text-[#221C16]">{d.displayDate}</td>
                      <td className="py-1 text-right font-bold text-[#221C16]">{d.count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
