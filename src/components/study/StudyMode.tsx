"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { FlashcardData } from "../flashcards/FlashcardItem";
import {
  Rating,
  previewNextReviews,
  ReviewSchedulePreview,
} from "@/lib/fsrs";
import { generateUUID } from "@/lib/uuid";
import { ArrowLeft } from "lucide-react";
import { WordNestMascot } from "../ui/Mascot";
import { PhysicalFlashcard } from "./PhysicalFlashcard";
import { StudyCompletionPostcard } from "./StudyCompletionPostcard";
import { playUISound } from "@/lib/ui-sound";
import { useToast } from "../ui/ToastProvider";

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
  backLabel = "Quay lại bộ từ",
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
  const [submittingRating, setSubmittingRating] = useState<Rating | null>(null);
  const reviewInFlight = useRef(false);
  const { error: toastError } = useToast();

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

  const advanceCard = useCallback(() => {
    if (currentIndex + 1 < totalCards) {
      setCurrentIndex((prev) => prev + 1);
      setIsAnswerRevealed(false);
    } else {
      setIsCompleted(true);
    }
  }, [currentIndex, totalCards]);

  const handleReveal = useCallback(() => {
    if (isAnswerRevealed) return;
    playUISound("paperFlip");
    setIsAnswerRevealed(true);
  }, [isAnswerRevealed]);

  const handleReviewAction = useCallback(
    async (rating: Rating) => {
      if (mode !== "scheduled-review" || !currentCard || reviewInFlight.current) return;

      // Tactile sound feedback based on rating choice
      if (rating === Rating.Again) {
        playUISound("error");
      } else if (rating === Rating.Hard) {
        playUISound("softTap");
      } else {
        playUISound("success");
      }

      reviewInFlight.current = true;
      setIsSubmitting(true);
      setSubmittingRating(rating);
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
        const msg =
          error instanceof Error
            ? `Lượt ôn chưa được lưu: ${error.message}`
            : "Lượt ôn chưa được lưu. Vui lòng thử lại khi có kết nối mạng.";
        setSaveError(msg);
        toastError("Không thể lưu lượt ôn. Thử lại nhé.");
        setFailedReview({ cardId, rating: appliedRating, reviewEventId, expectedSchedulerVersion });
      } finally {
        reviewInFlight.current = false;
        setIsSubmitting(false);
        setSubmittingRating(null);
      }
    },
    [advanceCard, currentCard, failedReview, mode, toastError]
  );

  const handleFreePracticeNext = useCallback(() => {
    if (mode !== "free-practice") return;
    playUISound("softTap");
    advanceCard();
  }, [advanceCard, mode]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setIsAnswerRevealed(false);
    setIsCompleted(false);
    setSessionAgain(0);
    setSessionHard(0);
    setSessionGood(0);
    setSessionEasy(0);
    setSaveError(null);
    setFailedReview(null);
  }, []);

  // Keyboard navigation: Space = Reveal, 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted) return;

      if (e.code === "Space" && !isAnswerRevealed) {
        e.preventDefault();
        handleReveal();
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
  }, [handleReveal, handleReviewAction, isAnswerRevealed, isCompleted, isSubmitting, mode]);

  // If deck is empty
  if (!cards || cards.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="brick-card p-8 bg-[#FFFDF9] space-y-4 shadow-[4px_4px_0px_#221C16]">
          <WordNestMascot mood="thinking" size={96} />
          <h2 className="text-xl font-black text-[#221C16]">
            Không có thẻ nào để học!
          </h2>
          <p className="text-sm font-semibold text-[#6B6258]">
            {mode === "scheduled-review"
              ? "Hiện không có thẻ đến hạn trong hàng đợi ôn tập."
              : "Bộ từ vựng này chưa có thẻ nào."}
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Link
              href={backHref ?? `/decks/${deckId}`}
              onClick={() => playUISound("softTap")}
              className="brick-button-primary px-5 py-2.5 text-xs sm:text-sm font-black inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{backLabel}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Session Completion Screen
  if (isCompleted) {
    return (
      <StudyCompletionPostcard
        deckId={deckId}
        deckName={deckName}
        mode={mode}
        sessionAgain={sessionAgain}
        sessionHard={sessionHard}
        sessionGood={sessionGood}
        sessionEasy={sessionEasy}
        saveError={saveError}
        backHref={backHref}
        backLabel={backLabel}
        onRestart={handleRestart}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto py-4 sm:py-6 px-3 sm:px-4 space-y-4">
      {/* Top Header & Progress Bar */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link
            href={backHref ?? `/decks/${deckId}`}
            onClick={() => playUISound("softTap")}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B6258] hover:text-[#221C16] p-1 rounded-md transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{backHref ? backLabel : "Thoát Study"}</span>
          </Link>

          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#6B6258] bg-[#FAF6EE] px-2.5 py-0.5 rounded-full border border-[#DCD3C5]">
            {mode === "scheduled-review" ? "Ôn tập" : "Luyện tự do"}
          </span>

          {/* Progress Indicator */}
          <div className="font-mono text-xs font-black text-[#221C16]">
            {currentIndex + 1} / {totalCards}
          </div>
        </div>

        {/* Tactile Progress Bar */}
        <div className="h-2.5 w-full overflow-hidden rounded-full border-2 border-[#221C16] bg-[#EDE6D8] p-0.5">
          <div
            className="h-full rounded-full bg-[#E06B43] transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
          />
        </div>

        {/* Retryable Error Notice if Review Failed to Commit */}
        {saveError && (
          <div
            role="alert"
            className="rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-xs font-bold text-[#991B1B] flex items-center justify-between gap-2"
          >
            <span>{saveError}</span>
            {failedReview && mode === "scheduled-review" && (
              <button
                type="button"
                onClick={() => void handleReviewAction(failedReview.rating)}
                className="underline font-black text-[#991B1B] shrink-0"
              >
                Gửi lại
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3D Physical Flashcard */}
      <div key={currentCard.id} className="wn-card-enter">
        <PhysicalFlashcard
          card={currentCard}
          isRevealed={isAnswerRevealed}
          onReveal={handleReveal}
          onRate={handleReviewAction}
          onNextFreePractice={handleFreePracticeNext}
          mode={mode}
          reviewSchedule={reviewSchedule}
          isSubmitting={isSubmitting}
          submittingRating={submittingRating}
        />
      </div>
    </div>
  );
}
