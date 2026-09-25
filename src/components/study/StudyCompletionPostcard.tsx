"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { WordNestMascot } from "../ui/Mascot";
import { playUISound } from "@/lib/ui-sound";
import { fireSessionCompletionConfetti } from "@/lib/celebration-confetti";
import { getPrefersReducedMotion } from "@/lib/motion-tokens";

export interface StudyCompletionPostcardProps {
  deckId: string;
  deckName: string;
  mode: "scheduled-review" | "free-practice";
  sessionAgain: number;
  sessionHard: number;
  sessionGood: number;
  sessionEasy: number;
  saveError: string | null;
  backHref?: string;
  backLabel?: string;
  onRestart: () => void;
}

export function StudyCompletionPostcard({
  deckId,
  deckName,
  mode,
  sessionAgain,
  sessionHard,
  sessionGood,
  sessionEasy,
  saveError,
  backHref,
  backLabel = "Quay lại danh sách thẻ",
  onRestart,
}: StudyCompletionPostcardProps) {
  const hasTriggeredCelebration = useRef(false);
  const totalReviews = sessionAgain + sessionHard + sessionGood + sessionEasy;
  const isReducedMotion = getPrefersReducedMotion();

  useEffect(() => {
    if (!hasTriggeredCelebration.current) {
      hasTriggeredCelebration.current = true;
      // Play completion chime
      playUISound("completion");
      // Fire confetti burst
      fireSessionCompletionConfetti();
    }
  }, []);

  const today = new Date();
  const day = today.getDate().toString().padStart(2, "0");
  const month = (today.getMonth() + 1).toString().padStart(2, "0");
  const year = today.getFullYear();

  return (
    <div className="mx-auto w-full max-w-lg py-4 sm:py-8 px-2 sm:px-4">
      <section
        className="wn-postcard relative overflow-hidden rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-5 sm:p-7 shadow-[4px_4px_0px_#221C16]"
        aria-labelledby="completion-heading"
      >
        {/* Subtle decorative postmark top right */}
        <div className="absolute right-4 top-4 hidden select-none sm:block opacity-65" aria-hidden="true">
          <div className="flex items-center gap-1 rounded-full border border-dashed border-[#8C7355] px-2.5 py-1 text-[10px] font-mono font-bold text-[#8C7355]">
            <span>WORDNEST</span>
            <span>·</span>
            <span>{day}/{month}/{year}</span>
          </div>
        </div>

        {/* Mascot & Headline */}
        <div className="text-center space-y-3 pt-2">
          <div className="flex justify-center">
            <WordNestMascot mood="celebrating" size={104} />
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D8CFC0] bg-[#EFE8DC] px-3 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[#6E6356]">
              <Sparkles className="h-3 w-3 text-[#E06B43]" />
              <span>{mode === "scheduled-review" ? "Phiên ôn tập" : "Luyện tự do"}</span>
            </div>
            <h1 id="completion-heading" className="text-2xl sm:text-3xl font-black text-[#221C16] tracking-tight">
              Hoàn thành buổi ôn!
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-[#6B6258] max-w-sm mx-auto">
              Từ vựng của <span className="font-extrabold text-[#221C16]">“{deckName}”</span> đã được ghi nhận an toàn.
            </p>
          </div>
        </div>

        {saveError && (
          <div
            role="alert"
            className="my-4 rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-xs font-bold text-[#991B1B]"
          >
            {saveError}
          </div>
        )}

        {/* Tactile Stamp */}
        <div className="my-5 flex justify-center">
          <div
            className={`inline-flex items-center gap-2 rounded-xl border-2 border-[#15803D] bg-[#DCFCE7] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#15803D] shadow-[2px_2px_0px_#15803D] select-none ${
              !isReducedMotion ? "wn-completion-stamp-slam" : ""
            }`}
            style={{ transform: "rotate(-1.5deg)" }}
          >
            <CheckCircle2 className="h-4 w-4" strokeWidth={2.75} />
            <span>ĐÃ HOÀN TẤT HÔM NAY</span>
          </div>
        </div>

        {/* FSRS Breakdown Summary */}
        {mode === "scheduled-review" && totalReviews > 0 ? (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Again */}
              <div className="rounded-xl border-2 border-[#991B1B] bg-[#FEE2E2] p-2.5 text-center shadow-[2px_2px_0px_#991B1B]">
                <div className="text-xl sm:text-2xl font-black text-[#991B1B]">{sessionAgain}</div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#991B1B] mt-0.5">
                  Again
                </div>
              </div>

              {/* Hard */}
              <div className="rounded-xl border-2 border-[#B45309] bg-[#FEF3C7] p-2.5 text-center shadow-[2px_2px_0px_#B45309]">
                <div className="text-xl sm:text-2xl font-black text-[#B45309]">{sessionHard}</div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#B45309] mt-0.5">
                  Hard
                </div>
              </div>

              {/* Good */}
              <div className="rounded-xl border-2 border-[#15803D] bg-[#DCFCE7] p-2.5 text-center shadow-[2px_2px_0px_#15803D]">
                <div className="text-xl sm:text-2xl font-black text-[#15803D]">{sessionGood}</div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#15803D] mt-0.5">
                  Good
                </div>
              </div>

              {/* Easy */}
              <div className="rounded-xl border-2 border-[#1E40AF] bg-[#DBEAFE] p-2.5 text-center shadow-[2px_2px_0px_#1E40AF]">
                <div className="text-xl sm:text-2xl font-black text-[#1E40AF]">{sessionEasy}</div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#1E40AF] mt-0.5">
                  Easy
                </div>
              </div>
            </div>

            {/* Total reviews count without fake retention metric */}
            <div className="flex items-center justify-between rounded-xl border border-[#DCD3C5] bg-[#FAF6EE] px-4 py-2.5 text-xs font-bold text-[#6B6258]">
              <span>Tổng số lượt ôn:</span>
              <span className="text-sm font-black text-[#221C16]">{totalReviews} lượt ôn</span>
            </div>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2.5 pt-4 border-t border-dashed border-[#DCD3C5]">
          <Link
            href={backHref ?? `/decks/${deckId}`}
            onClick={() => playUISound("softTap")}
            className="brick-button-primary w-full min-h-[44px] py-3 text-sm font-black inline-flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{backLabel ?? "Quay lại bộ từ"}</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              playUISound("softTap");
              onRestart();
            }}
            className="brick-button-secondary w-full min-h-[44px] py-3 text-sm font-bold inline-flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{mode === "scheduled-review" ? "Xem lại hàng đợi" : "Luyện tập lại"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
