"use client";

import React from "react";
import { FlashcardData } from "../flashcards/FlashcardItem";
import { PronounceButton } from "../flashcards/PronounceButton";
import { Rating, ReviewSchedulePreview } from "@/lib/fsrs";
import { HelpCircle, Loader2, RotateCcw, ThumbsUp, Zap } from "lucide-react";

export interface PhysicalFlashcardProps {
  card: FlashcardData;
  isRevealed: boolean;
  onReveal: () => void;
  onRate: (rating: Rating) => void;
  onNextFreePractice?: () => void;
  mode: "scheduled-review" | "free-practice";
  reviewSchedule: ReviewSchedulePreview | null;
  isSubmitting: boolean;
  submittingRating: Rating | null;
}

export function PhysicalFlashcard({
  card,
  isRevealed,
  onReveal,
  onRate,
  onNextFreePractice,
  mode,
  reviewSchedule,
  isSubmitting,
  submittingRating,
}: PhysicalFlashcardProps) {
  const againInterval = reviewSchedule?.again.intervalText || "10m";
  const hardInterval = reviewSchedule?.hard.intervalText || "1d";
  const goodInterval = reviewSchedule?.good.intervalText || "3d";
  const easyInterval = reviewSchedule?.easy.intervalText || "7d";

  // Prevent event bubbling so audio clicks never accidentally trigger reveal
  const handleAudioClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="wn-flashcard-3d-scene w-full">
      <div
        className={`wn-flashcard-3d-card ${isRevealed ? "is-flipped" : ""}`}
      >
        {/* ================= FRONT SIDE ================= */}
        <div
          className="wn-flashcard-face wn-flashcard-front brick-card flex min-h-[380px] sm:min-h-[440px] flex-col justify-between bg-[#FFFDF9] p-5 sm:p-7 shadow-[4px_4px_0px_#221C16]"
          aria-hidden={isRevealed}
        >
          {/* Front Header */}
          <div className="flex items-center justify-between border-b border-dashed border-[#DCD3C5] pb-3">
            <span className="text-[11px] font-mono font-black uppercase tracking-wider text-[#6B6258]">
              CÂU HỎI
            </span>
            <div onClick={handleAudioClick}>
              <PronounceButton text={card.term} size="sm" label="Nghe từ" />
            </div>
          </div>

          {/* Front Content: Term & Optional Image */}
          <div className="my-auto py-6 text-center space-y-4">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#221C16] tracking-tight break-words">
              {card.term}
            </h1>

            {card.imageUrl ? (
              <div className="relative mx-auto h-40 sm:h-52 w-full max-w-sm overflow-hidden rounded-xl border-2 border-[#221C16] bg-[#F4EFE6] shadow-[2px_2px_0px_#221C16]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.imageUrl}
                  alt={card.term}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
                {card.imageAuthor && (
                  <div className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                    {card.imageAuthor} {card.imageSource ? `• ${card.imageSource}` : ""}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Front Action CTA */}
          <div className="pt-4 border-t border-dashed border-[#DCD3C5] flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onReveal}
              className="brick-button-secondary w-full min-h-[48px] py-3.5 text-base font-black flex items-center justify-center gap-2"
            >
              <span>Hiện đáp án</span>
            </button>
            <span className="text-[11px] font-semibold text-[#8C8275] select-none">
              Nhấn nút hoặc phím <kbd className="font-mono font-bold text-[#221C16] bg-[#FAF6EE] px-1.5 py-0.5 rounded border border-[#DCD3C5]">Space</kbd>
            </span>
          </div>
        </div>

        {/* ================= BACK SIDE ================= */}
        <div
          className="wn-flashcard-face wn-flashcard-back brick-card flex min-h-[380px] sm:min-h-[440px] flex-col justify-between bg-[#FFFDF9] p-5 sm:p-7 shadow-[4px_4px_0px_#221C16]"
          aria-hidden={!isRevealed}
        >
          {/* Back Header: Term reminder, POS & IPA */}
          <div className="flex items-center justify-between border-b border-dashed border-[#DCD3C5] pb-3">
            <div className="min-w-0 flex items-baseline gap-2">
              <span className="truncate text-base sm:text-lg font-black text-[#221C16]">
                {card.term}
              </span>
              {card.partOfSpeech ? (
                <span className="shrink-0 text-xs font-semibold italic text-[#E06B43]">
                  {card.partOfSpeech}
                </span>
              ) : null}
              {card.ipa ? (
                <span className="shrink-0 font-mono text-xs text-[#6B6258]">
                  {card.ipa}
                </span>
              ) : null}
            </div>

            <div onClick={handleAudioClick}>
              <PronounceButton text={card.term} size="sm" label="Nghe từ" />
            </div>
          </div>

          {/* Back Content: Vietnamese Meaning & Examples */}
          <div className="my-auto py-4 space-y-3.5">
            {/* Vietnamese Meaning */}
            <div className="rounded-xl border-2 border-[#221C16] bg-[#FEF8ED] p-3.5 shadow-[2px_2px_0px_#221C16]">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#E06B43] mb-0.5">
                Nghĩa tiếng Việt
              </div>
              <p className="text-lg sm:text-xl font-black text-[#221C16] break-words">
                {card.meaningVi}
              </p>
              {card.definitionEn ? (
                <p className="mt-1 text-xs sm:text-sm italic text-[#6B6258]">
                  {card.definitionEn}
                </p>
              ) : null}
            </div>

            {/* Example Sentence */}
            {card.exampleEn ? (
              <div className="rounded-xl border border-[#DCD3C5] bg-[#FAF6EE] p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B6258]">
                    Ví dụ minh họa
                  </span>
                  <div onClick={handleAudioClick}>
                    <PronounceButton text={card.exampleEn} size="sm" />
                  </div>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-[#221C16]">
                  &ldquo;{card.exampleEn}&rdquo;
                </p>
                {card.exampleVi ? (
                  <p className="text-xs text-[#6B6258] font-medium">
                    &rarr; {card.exampleVi}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Back Rating Area */}
          <div className="pt-4 border-t border-dashed border-[#DCD3C5]">
            {mode === "scheduled-review" ? (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Rating 1: Again */}
                  <button
                    type="button"
                    onClick={() => onRate(Rating.Again)}
                    disabled={isSubmitting}
                    className="p-2 sm:p-2.5 rounded-xl border-2 border-[#991B1B] bg-[#FEE2E2] hover:bg-[#FECACA] text-[#991B1B] shadow-[2px_2px_0px_#991B1B] flex flex-col items-center justify-center gap-0.5 active:translate-y-0.5 transition-all text-center min-h-[48px] select-none"
                    aria-label={`Again, ôn lại sau ${againInterval}`}
                    suppressHydrationWarning
                  >
                    <div className="flex items-center gap-1 font-black text-xs sm:text-sm">
                      {isSubmitting && submittingRating === Rating.Again ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>Again</span>
                      <span className="hidden sm:inline text-[10px] font-mono opacity-60">[1]</span>
                    </div>
                    <span className="text-[10px] font-black opacity-80" suppressHydrationWarning>
                      {againInterval}
                    </span>
                  </button>

                  {/* Rating 2: Hard */}
                  <button
                    type="button"
                    onClick={() => onRate(Rating.Hard)}
                    disabled={isSubmitting}
                    className="p-2 sm:p-2.5 rounded-xl border-2 border-[#B45309] bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#92400E] shadow-[2px_2px_0px_#B45309] flex flex-col items-center justify-center gap-0.5 active:translate-y-0.5 transition-all text-center min-h-[48px] select-none"
                    aria-label={`Hard, ôn lại sau ${hardInterval}`}
                    suppressHydrationWarning
                  >
                    <div className="flex items-center gap-1 font-black text-xs sm:text-sm">
                      {isSubmitting && submittingRating === Rating.Hard ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>Hard</span>
                      <span className="hidden sm:inline text-[10px] font-mono opacity-60">[2]</span>
                    </div>
                    <span className="text-[10px] font-black opacity-80" suppressHydrationWarning>
                      {hardInterval}
                    </span>
                  </button>

                  {/* Rating 3: Good */}
                  <button
                    type="button"
                    onClick={() => onRate(Rating.Good)}
                    disabled={isSubmitting}
                    className="p-2 sm:p-2.5 rounded-xl border-2 border-[#15803D] bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#166534] shadow-[2px_2px_0px_#15803D] flex flex-col items-center justify-center gap-0.5 active:translate-y-0.5 transition-all text-center min-h-[48px] select-none"
                    aria-label={`Good, ôn lại sau ${goodInterval}`}
                    suppressHydrationWarning
                  >
                    <div className="flex items-center gap-1 font-black text-xs sm:text-sm">
                      {isSubmitting && submittingRating === Rating.Good ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>Good</span>
                      <span className="hidden sm:inline text-[10px] font-mono opacity-60">[3]</span>
                    </div>
                    <span className="text-[10px] font-black opacity-80" suppressHydrationWarning>
                      {goodInterval}
                    </span>
                  </button>

                  {/* Rating 4: Easy */}
                  <button
                    type="button"
                    onClick={() => onRate(Rating.Easy)}
                    disabled={isSubmitting}
                    className="p-2 sm:p-2.5 rounded-xl border-2 border-[#1E40AF] bg-[#DBEAFE] hover:bg-[#BFDBFE] text-[#1E40AF] shadow-[2px_2px_0px_#1E40AF] flex flex-col items-center justify-center gap-0.5 active:translate-y-0.5 transition-all text-center min-h-[48px] select-none"
                    aria-label={`Easy, ôn lại sau ${easyInterval}`}
                    suppressHydrationWarning
                  >
                    <div className="flex items-center gap-1 font-black text-xs sm:text-sm">
                      {isSubmitting && submittingRating === Rating.Easy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>Easy</span>
                      <span className="hidden sm:inline text-[10px] font-mono opacity-60">[4]</span>
                    </div>
                    <span className="text-[10px] font-black opacity-80" suppressHydrationWarning>
                      {easyInterval}
                    </span>
                  </button>
                </div>

                <div className="text-center">
                  <span className="text-[11px] font-semibold text-[#8C8275] select-none">
                    Dùng phím <kbd className="font-mono font-bold text-[#221C16]">1</kbd>, <kbd className="font-mono font-bold text-[#221C16]">2</kbd>, <kbd className="font-mono font-bold text-[#221C16]">3</kbd>, <kbd className="font-mono font-bold text-[#221C16]">4</kbd> để đánh giá
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={onNextFreePractice}
                className="brick-button-primary w-full min-h-[48px] py-3.5 text-base font-black shadow-[4px_4px_0px_#221C16]"
              >
                Thẻ tiếp theo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
