"use client";

import React from "react";
import { Flame, Trophy, CalendarCheck2, CheckCircle2 } from "lucide-react";
import type { ReviewStreakMetrics } from "@/services/vocabulary/review-activity-service";

interface ReviewStreakSummaryProps {
  metrics: ReviewStreakMetrics;
  periodLabel: string;
}

export function ReviewStreakSummary({ metrics, periodLabel }: ReviewStreakSummaryProps) {
  const { currentStreak, longestStreak, activeDaysInPeriod, isTodayActive, todayReviewCount } = metrics;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {/* Current Streak */}
      <div className="group relative flex items-center justify-between rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-3.5 shadow-[2px_2px_0px_#221C16] transition-transform hover:-translate-y-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#6B6258]">
            <Flame className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
            <span>Chuỗi hiện tại</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-[#221C16]">
              {currentStreak}
            </span>
            <span className="text-xs font-bold text-[#6B6258]">ngày</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-bold">
            {isTodayActive ? (
              <span className="inline-flex items-center gap-1 text-[#15803D]">
                <CheckCircle2 className="h-3 w-3" />
                <span>Hôm nay đã nối chuỗi (+{todayReviewCount})</span>
              </span>
            ) : (
              <span className="text-[#8C8275]">Chưa ôn hôm nay</span>
            )}
          </div>
        </div>
        {isTodayActive && (
          <span className="wn-stamp absolute top-2 right-2 text-[10px] text-[#15803D] border-[#15803D]">
            ĐẠT
          </span>
        )}
      </div>

      {/* Longest Streak */}
      <div className="flex items-center justify-between rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-3.5 shadow-[2px_2px_0px_#221C16] transition-transform hover:-translate-y-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#6B6258]">
            <Trophy className="h-4 w-4 shrink-0 text-[#D97706]" strokeWidth={2.5} />
            <span>Chuỗi dài nhất</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-[#221C16]">
              {longestStreak}
            </span>
            <span className="text-xs font-bold text-[#6B6258]">ngày</span>
          </div>
          <p className="mt-1 text-[11px] font-bold text-[#8C8275]">
            Kỷ lục ôn liên tục
          </p>
        </div>
      </div>

      {/* Active Days in Period */}
      <div className="flex items-center justify-between rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-3.5 shadow-[2px_2px_0px_#221C16] transition-transform hover:-translate-y-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#6B6258]">
            <CalendarCheck2 className="h-4 w-4 shrink-0 text-[#0D9488]" strokeWidth={2.5} />
            <span>Ngày có ôn tập</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-[#221C16]">
              {activeDaysInPeriod}
            </span>
            <span className="text-xs font-bold text-[#6B6258]">ngày</span>
          </div>
          <p className="mt-1 text-[11px] font-bold text-[#8C8275]">
            Trong {periodLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
