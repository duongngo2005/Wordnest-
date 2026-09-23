"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { FlashcardData } from "../flashcards/FlashcardItem";
import { PronounceButton } from "../flashcards/PronounceButton";
import {
  Rating,
  previewNextReviews,
  ReviewSchedulePreview,
} from "@/lib/fsrs";
import { generateUUID } from "@/lib/uuid";
import {
  ArrowLeft,
  RotateCcw,
  ThumbsUp,
  Zap,
  HelpCircle,
} from "lucide-react";
import { WordNestMascot } from "../ui/Mascot";

interface StudyModeProps {
  deckId: string;
  deckName: string;
  initialCards: FlashcardData[];
  mode: "scheduled-review" | "free-practice";
  backHref?: string;
  backLabel?: string;
}

interface FailedScheduledReview {
  cardId: string;
  rating: Rating;
  reviewEventId: string;
  expectedSchedulerVersion: number;
}

export function StudyMode({
  deckId,
  deckName,
  initialCards,
  mode,
  backHref,
  backLabel = "Quay lại bộ thẻ",
}: StudyModeProps) {
  const [reviewedCards, setReviewedCards] = useState<Record<string, FlashcardData>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Session summary counters for 4 FSRS ratings
  const [sessionAgain, setSessionAgain] = useState(0);
  const [sessionHard, setSessionHard] = useState(0);
  const [sessionGood, setSessionGood] = useState(0);
  const [sessionEasy, setSessionEasy] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [failedReview, setFailedReview] = useState<FailedScheduledReview | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const reviewInFlight = useRef(false);

  const cards = useMemo(
    () => initialCards.map((card) => reviewedCards[card.id] ?? card),
    [initialCards, reviewedCards]
  );

  const totalCards = cards.length;
  const currentCard = cards[currentIndex];

  // Calculate FSRS next review preview intervals for the current card
  const reviewSchedule: ReviewSchedulePreview | null = useMemo(() => {
    if (!currentCard || mode !== "scheduled-review") return null;
    try {
      return previewNextReviews(currentCard, new Date());
    } catch {
      return null;
    }
  }, [currentCard, mode]);

  const submitReviewOnServer = async (
    cardId: string,
    rating: Rating,
    reviewEventId: string,
    expectedSchedulerVersion: number
  ) => {
      const res = await fetch(`/api/cards/${cardId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, reviewEventId, expectedSchedulerVersion }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Máy chủ không thể lưu lượt ôn.";
        throw new Error(message);
      }
      return (data as { card: FlashcardData }).card;
  };

  const advanceCard = React.useCallback(() => {
    if (currentIndex + 1 < totalCards) {
      setCurrentIndex((prev) => prev + 1);
      setIsAnswerRevealed(false);
    } else {
      setIsCompleted(true);
    }
  }, [currentIndex, totalCards]);

  const handleReviewAction = React.useCallback(
    async (rating: Rating) => {
      if (mode !== "scheduled-review" || !currentCard || reviewInFlight.current) return;

      reviewInFlight.current = true;
      setIsSubmitting(true);
      setSaveError(null);

      const cardId = currentCard.id;
      const retry = failedReview?.cardId === cardId ? failedReview : null;
      const reviewEventId = retry?.reviewEventId ?? generateUUID();
      const expectedSchedulerVersion = retry?.expectedSchedulerVersion ?? currentCard.schedulerVersion ?? 0;
      const appliedRating = retry?.rating ?? rating;

      try {
        const updatedCard = await submitReviewOnServer(
          cardId,
          appliedRating,
          reviewEventId,
          expectedSchedulerVersion
        );
        setReviewedCards((previous) => ({
          ...previous,
          [updatedCard.id]: { ...currentCard, ...updatedCard },
        }));
        if (appliedRating === Rating.Again) setSessionAgain((prev) => prev + 1);
        else if (appliedRating === Rating.Hard) setSessionHard((prev) => prev + 1);
        else if (appliedRating === Rating.Good) setSessionGood((prev) => prev + 1);
        else if (appliedRating === Rating.Easy) setSessionEasy((prev) => prev + 1);
        setFailedReview(null);
        advanceCard();
      } catch (error) {
        console.error("Failed to submit review to server:", error);
        setSaveError(
          error instanceof Error
            ? `Lượt ôn chưa được lưu: ${error.message}`
            : "Lượt ôn chưa được lưu. Vui lòng thử lại khi có kết nối mạng."
        );
        setFailedReview({ cardId, rating: appliedRating, reviewEventId, expectedSchedulerVersion });
      } finally {
        reviewInFlight.current = false;
        setIsSubmitting(false);
      }
    },
    [advanceCard, currentCard, failedReview, mode]
  );

  const handleFreePracticeNext = () => {
    if (mode !== "free-practice") return;
    advanceCard();
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsAnswerRevealed(false);
    setIsCompleted(false);
    setSessionAgain(0);
    setSessionHard(0);
    setSessionGood(0);
    setSessionEasy(0);
    setSaveError(null);
    setFailedReview(null);
  };

  // Keyboard navigation: Space = Reveal, 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted) return;

      if (e.code === "Space" && !isAnswerRevealed) {
        e.preventDefault();
        setIsAnswerRevealed(true);
      } else if (isAnswerRevealed && mode === "scheduled-review" && !isSubmitting) {
        if (e.key === "1" || e.code === "Digit1") {
          e.preventDefault();
          handleReviewAction(Rating.Again);
        } else if (e.key === "2" || e.code === "Digit2") {
          e.preventDefault();
          handleReviewAction(Rating.Hard);
        } else if (e.key === "3" || e.code === "Digit3") {
          e.preventDefault();
          handleReviewAction(Rating.Good);
        } else if (e.key === "4" || e.code === "Digit4") {
          e.preventDefault();
          handleReviewAction(Rating.Easy);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswerRevealed, isCompleted, isSubmitting, mode, handleReviewAction]);

  // If deck is empty
  if (!cards || cards.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="brick-card p-8 bg-[#FFFDF9] space-y-4">
          <WordNestMascot mood="thinking" size={96} />
          <h2 className="text-xl font-black text-[#221C16]">
            Không có thẻ nào để học!
          </h2>
          <p className="text-sm text-[#6B6258]">
            {mode === "scheduled-review"
              ? "Hiện không có thẻ đến hạn trong hàng đợi ôn tập."
              : "Bộ từ vựng này chưa có thẻ nào."}
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href={backHref ?? `/decks/${deckId}`}
              className="brick-button-primary px-5 py-2.5 text-xs sm:text-sm font-bold inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {backLabel}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Completion screen
  if (isCompleted) {
    const totalReviews = sessionAgain + sessionHard + sessionGood + sessionEasy;
    const successfulReviews = sessionGood + sessionEasy;
    const accuracy =
      totalReviews > 0 ? Math.round((successfulReviews / totalReviews) * 100) : 100;

    return (
      <div className="max-w-md mx-auto py-8 px-4 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="brick-card p-6 sm:p-8 bg-[#FFFDF9] space-y-6">
          <div className="flex justify-center">
            <WordNestMascot mood="celebrating" size={120} />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-black text-[#221C16]">
              Xuất sắc! Đã hoàn thành!
            </h2>
            <p className="text-xs sm:text-sm text-[#6B6258] font-medium">
              Bạn vừa hoàn tất {mode === "scheduled-review" ? "phiên ôn tập" : "phiên luyện tự do"} cho bộ từ vựng:{" "}
              <strong className="text-[#221C16]">{deckName}</strong>
            </p>
          </div>

          {saveError && (
            <div role="alert" className="rounded-lg border-2 border-[#B91C1C] bg-[#FEE2E2] px-3 py-2 text-left text-xs font-bold text-[#991B1B]">
              {saveError}
            </div>
          )}

          {mode === "scheduled-review" && <>
          {/* FSRS Session Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <div className="p-3 rounded-xl border-2 border-[#991B1B] bg-[#FEE2E2] text-center shadow-[2px_2px_0px_#991B1B]">
              <div className="text-xl sm:text-2xl font-black text-[#991B1B]">
                {sessionAgain}
              </div>
              <div className="text-[10px] font-extrabold text-[#991B1B] uppercase tracking-wider mt-0.5">
                Again
              </div>
            </div>

            <div className="p-3 rounded-xl border-2 border-[#B45309] bg-[#FEF3C7] text-center shadow-[2px_2px_0px_#B45309]">
              <div className="text-xl sm:text-2xl font-black text-[#B45309]">
                {sessionHard}
              </div>
              <div className="text-[10px] font-extrabold text-[#B45309] uppercase tracking-wider mt-0.5">
                Hard
              </div>
            </div>

            <div className="p-3 rounded-xl border-2 border-[#15803D] bg-[#DCFCE7] text-center shadow-[2px_2px_0px_#15803D]">
              <div className="text-xl sm:text-2xl font-black text-[#15803D]">
                {sessionGood}
              </div>
              <div className="text-[10px] font-extrabold text-[#15803D] uppercase tracking-wider mt-0.5">
                Good
              </div>
            </div>

            <div className="p-3 rounded-xl border-2 border-[#1E40AF] bg-[#DBEAFE] text-center shadow-[2px_2px_0px_#1E40AF]">
              <div className="text-xl sm:text-2xl font-black text-[#1E40AF]">
                {sessionEasy}
              </div>
              <div className="text-[10px] font-extrabold text-[#1E40AF] uppercase tracking-wider mt-0.5">
                Easy
              </div>
            </div>
          </div>

          {/* Retention Accuracy Rate */}
          <div className="p-3 rounded-xl bg-[#FAF6EE] border-2 border-[#221C16]/20 flex items-center justify-between text-xs font-bold text-[#6B6258]">
            <span>Độ ghi nhớ phiên này:</span>
            <span className="text-base font-black text-[#15803D]">{accuracy}%</span>
          </div>
          </>}

          <div className="pt-2 flex flex-col gap-2.5">
            <button
              onClick={handleRestart}
              className="brick-button-primary w-full py-3 text-sm font-black gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {mode === "scheduled-review" ? "Xem lại hàng đợi" : "Luyện tập lại"}
            </button>
            <Link
              href={backHref ?? `/decks/${deckId}`}
              className="brick-button-secondary w-full py-3 text-sm font-bold gap-2 text-center"
            >
              <ArrowLeft className="w-4 h-4" />
              {backHref ? backLabel : "Quay lại danh sách thẻ"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Next intervals display strings
  const againInterval = reviewSchedule?.again.intervalText || "10m";
  const hardInterval = reviewSchedule?.hard.intervalText || "1d";
  const goodInterval = reviewSchedule?.good.intervalText || "3d";
  const easyInterval = reviewSchedule?.easy.intervalText || "7d";

  return (
    <div className="max-w-xl mx-auto py-6 px-4 space-y-5">
      {/* Top Header, Queue Filter & Progress Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link
            href={backHref ?? `/decks/${deckId}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#6B6258] hover:text-[#221C16] p-1 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{backHref ? backLabel : "Thoát Study"}</span>
          </Link>

          <span className="text-[11px] font-bold text-[#6B6258]">
            {mode === "scheduled-review" ? "Ôn tập" : "Luyện tự do"}
          </span>

          {/* Progress Indicator */}
          <div className="font-mono text-xs font-bold text-[#6B6258]">
            {currentIndex + 1} / {totalCards}
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[#221C16] bg-[#FAF6EE] p-0.5 shadow-inner">
          <div
            className="h-full rounded-full bg-[#E06B43] transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
          />
        </div>
        {saveError && (
          <div role="alert" className="rounded-lg border-2 border-[#B91C1C] bg-[#FEE2E2] px-3 py-2 text-xs font-bold text-[#991B1B]">
            {saveError}
            {failedReview && mode === "scheduled-review" && (
              <button
                onClick={() => void handleReviewAction(failedReview.rating)}
                className="ml-2 underline"
              >
                Gửi lại lượt ôn
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Flashcard in Study Mode */}
      <div className="brick-card flex min-h-[380px] flex-col justify-between bg-[#FFFDF9] p-5 sm:min-h-[440px] sm:p-7 shadow-[4px_4px_0px_#221C16]">
        {/* Front of Card (Always Visible) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold italic text-[#6B6258]">{isAnswerRevealed ? currentCard.partOfSpeech : null}</div>

            <PronounceButton text={currentCard.term} size="sm" label="Nghe từ" />
          </div>

          {/* Term Display */}
          <div className="text-center py-4 sm:py-6">
            <h1 className="text-3xl sm:text-4xl font-black text-[#221C16] tracking-tight break-words">
              {currentCard.term}
            </h1>
            {isAnswerRevealed && currentCard.ipa && (
              <p className="text-sm sm:text-base font-mono text-[#6B6258] mt-1.5">
                {currentCard.ipa}
              </p>
            )}
          </div>

          {/* Image if available */}
          {currentCard.imageUrl && (
            <div className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden border-2 border-[#221C16] bg-[#F4EFE6] mx-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentCard.imageUrl}
                alt={currentCard.term}
                className="w-full h-full object-cover"
                loading="eager"
              />
              {currentCard.imageAuthor && (
                <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded backdrop-blur-sm">
                  {currentCard.imageAuthor} {currentCard.imageSource ? `• ${currentCard.imageSource}` : ""}
                </div>
              )}
            </div>
          )}

          {/* Back / Revealed Answer */}
          {isAnswerRevealed ? (
            <div className="space-y-4 border-t border-[#221C16]/12 pt-4 animate-in fade-in duration-200">
              {/* Vietnamese Meaning */}
              <div className="rounded-xl border border-[#DCD3C5] bg-[#FAF6EE] p-3.5">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#E06B43] mb-0.5">
                  Nghĩa tiếng Việt
                </div>
                <p className="text-lg sm:text-xl font-extrabold text-[#221C16]">
                  {currentCard.meaningVi}
                </p>
                {currentCard.definitionEn ? <p className="text-xs sm:text-sm text-[#6B6258] mt-1 italic">{currentCard.definitionEn}</p> : null}
              </div>

              {/* Example Sentence */}
              {currentCard.exampleEn ? <div className="space-y-1.5 rounded-xl border border-[#DCD3C5] bg-[#FAF6EE] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B6258]">
                    Ví dụ minh họa
                  </span>
                  <PronounceButton text={currentCard.exampleEn} size="sm" />
                </div>
                <p className="text-sm font-semibold text-[#221C16]">
                  &ldquo;{currentCard.exampleEn}&rdquo;
                </p>
                {currentCard.exampleVi ? <p className="text-xs text-[#6B6258] font-medium">&rarr; {currentCard.exampleVi}</p> : null}
              </div> : null}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-[#6B6258] font-bold">
              Nhấn &ldquo;Hiện đáp án&rdquo; hoặc phím Space
            </div>
          )}
        </div>

        {/* Bottom Actions: 4 FSRS Review Buttons */}
        <div className="pt-6">
          {!isAnswerRevealed ? (
            <button
              onClick={() => setIsAnswerRevealed(true)}
              className="brick-button-secondary w-full py-3.5 text-base font-black"
            >
              Hiện đáp án
            </button>
          ) : mode === "scheduled-review" ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
              {/* 1: Again (Rating 1) */}
              <button
                onClick={() => handleReviewAction(Rating.Again)}
                disabled={isSubmitting}
                className="p-2.5 sm:p-3 rounded-xl border-2 border-[#991B1B] bg-[#FEE2E2] hover:bg-[#FECACA] text-[#991B1B] shadow-[2.5px_2.5px_0px_#991B1B] flex flex-col items-center justify-center gap-0.5 active:translate-y-0.5 transition-all text-center min-h-[54px] whitespace-nowrap"
              >
                <div className="flex items-center gap-1 font-black text-xs sm:text-sm">
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Again</span>
                  <span className="hidden sm:inline text-[10px] bg-black/10 px-1 rounded font-mono">[1]</span>
                </div>
                <div className="text-[11px] font-extrabold opacity-80">
                  {againInterval}
                </div>
              </button>

              {/* 2: Hard (Rating 2) */}
              <button
                onClick={() => handleReviewAction(Rating.Hard)}
                disabled={isSubmitting}
                className="p-2.5 sm:p-3 rounded-xl border-2 border-[#B45309] bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#92400E] shadow-[2.5px_2.5px_0px_#B45309] flex flex-col items-center justify-center gap-0.5 active:translate-y-0.5 transition-all text-center min-h-[54px] whitespace-nowrap"
              >
                <div className="flex items-center gap-1 font-black text-xs sm:text-sm">
                  <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Hard</span>
                  <span className="hidden sm:inline text-[10px] bg-black/10 px-1 rounded font-mono">[2]</span>
                </div>
                <div className="text-[11px] font-extrabold opacity-80">
                  {hardInterval}
                </div>
              </button>

              {/* 3: Good (Rating 3) */}
              <button
                onClick={() => handleReviewAction(Rating.Good)}
                disabled={isSubmitting}
                className="p-2.5 sm:p-3 rounded-xl border-2 border-[#15803D] bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#166534] shadow-[2.5px_2.5px_0px_#15803D] flex flex-col items-center justify-center gap-0.5 active:translate-y-0.5 transition-all text-center min-h-[54px] whitespace-nowrap"
              >
                <div className="flex items-center gap-1 font-black text-xs sm:text-sm">
                  <ThumbsUp className="w-3.5 h-3.5 shrink-0" />
                  <span>Good</span>
                  <span className="hidden sm:inline text-[10px] bg-black/10 px-1 rounded font-mono">[3]</span>
                </div>
                <div className="text-[11px] font-extrabold opacity-80">
                  {goodInterval}
                </div>
              </button>

              {/* 4: Easy (Rating 4) */}
              <button
                onClick={() => handleReviewAction(Rating.Easy)}
                disabled={isSubmitting}
                className="p-2.5 sm:p-3 rounded-xl border-2 border-[#1E40AF] bg-[#DBEAFE] hover:bg-[#BFDBFE] text-[#1E40AF] shadow-[2.5px_2.5px_0px_#1E40AF] flex flex-col items-center justify-center gap-0.5 active:translate-y-0.5 transition-all text-center min-h-[54px] whitespace-nowrap"
              >
                <div className="flex items-center gap-1 font-black text-xs sm:text-sm">
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  <span>Easy</span>
                  <span className="hidden sm:inline text-[10px] bg-black/10 px-1 rounded font-mono">[4]</span>
                </div>
                <div className="text-[11px] font-extrabold opacity-80">
                  {easyInterval}
                </div>
              </button>
            </div>
          ) : (
            <button
              onClick={handleFreePracticeNext}
              className="brick-button-primary w-full py-3.5 text-base font-black shadow-[4px_4px_0px_#221C16]"
            >
              Thẻ tiếp theo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
