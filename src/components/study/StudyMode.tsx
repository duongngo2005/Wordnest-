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
import { ArrowLeft, Plus } from "lucide-react";
import { WordNestMascot } from "../ui/Mascot";
import { PhysicalFlashcard } from "./PhysicalFlashcard";
import { StudyCompletionPostcard } from "./StudyCompletionPostcard";
import { playUISound } from "@/lib/ui-sound";
import { isSpeechSupported, speakEnglish } from "@/lib/speech";
import { useToast } from "../ui/ToastProvider";
import { FlashcardEditorDialog, FlashcardEditDraft } from "../flashcards/FlashcardEditorDialog";
import {
  StudyManualDuplicateReviewDialog,
  StudyManualFlashcardDialog,
  type StudyManualDuplicatePreview,
  type StudyManualFlashcardDraft,
} from "./StudyManualFlashcardDialog";

interface StudyModeProps {
  deckId: string;
  deckName: string;
  initialCards: FlashcardData[];
  mode: "scheduled-review" | "free-practice";
  backHref?: string;
  backLabel?: string;
  /** A deck-study route supplies its visible deck; grouped review falls back to the current card's source. */
  manualAddDeckId?: string;
}

interface FailedScheduledReview {
  cardId: string;
  rating: Rating;
  reviewEventId: string;
  expectedSchedulerVersion: number;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null
  );
}

export function StudyMode({
  deckId,
  deckName,
  initialCards,
  mode,
  backHref,
  backLabel = "Quay lại bộ từ",
  manualAddDeckId,
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
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<StudyManualFlashcardDraft | undefined>();
  const [manualDuplicatePreview, setManualDuplicatePreview] = useState<StudyManualDuplicatePreview | null>(null);
  const reviewInFlight = useRef(false);
  const lastAutoPronouncedCardId = useRef<string | null>(null);
  const { error: toastError } = useToast();

  const cards = useMemo(
    () => initialCards.map((card) => reviewedCards[card.id] ?? card),
    [initialCards, reviewedCards]
  );

  const totalCards = cards.length;
  const currentCard = cards[currentIndex];
  const currentCardId = currentCard?.id;
  const currentCardTerm = currentCard?.term;
  const currentCardExample = currentCard?.exampleEn;
  const manualTargetDeckId = manualAddDeckId ?? currentCard?.deckId ?? null;
  const isStudyOverlayOpen = isEditingCard || isManualAddOpen || manualDuplicatePreview !== null;

  // A review card always presents its English term on the front. Read it once
  // whenever a new scheduled-review card becomes current, while preserving the
  // learner's selected system or WordNest voice and rate. The ref prevents a
  // state-only re-render (for example, a schedule preview update) from reading
  // the same card again.
  useEffect(() => {
    if (
      mode !== "scheduled-review" ||
      isCompleted ||
      !currentCardId ||
      !currentCardTerm ||
      lastAutoPronouncedCardId.current === currentCardId ||
      !isSpeechSupported()
    ) {
      return;
    }

    lastAutoPronouncedCardId.current = currentCardId;
    speakEnglish(currentCardTerm);
  }, [currentCardId, currentCardTerm, isCompleted, mode]);

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
      if (mode !== "scheduled-review" || !currentCard || isStudyOverlayOpen || reviewInFlight.current) return;

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
        const isConnectionFailure =
          error instanceof TypeError ||
          (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message));
        const msg =
          isConnectionFailure
            ? "Lượt ôn chưa được lưu: Không kết nối được máy chủ WordNest. Kiểm tra mạng hoặc Tailscale rồi thử lại."
            : error instanceof Error
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
    [advanceCard, currentCard, failedReview, isStudyOverlayOpen, mode, toastError]
  );

  const saveCurrentCardEdit = useCallback(
    async (draft: FlashcardEditDraft) => {
      if (!currentCard) return;

      const response = await fetch(`/api/cards/${currentCard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Không thể lưu thẻ."
        );
      }
      if (typeof payload !== "object" || payload === null || !("card" in payload) || !payload.card) {
        throw new Error("Máy chủ không trả về thẻ đã cập nhật.");
      }

      const updatedCard = payload.card as FlashcardData;
      setReviewedCards((previous) => ({
        ...previous,
        [currentCard.id]: { ...currentCard, ...updatedCard },
      }));
    },
    [currentCard]
  );

  const handleFreePracticeNext = useCallback(() => {
    if (mode !== "free-practice") return;
    playUISound("softTap");
    advanceCard();
  }, [advanceCard, mode]);

  const handleRestart = useCallback(() => {
    lastAutoPronouncedCardId.current = null;
    setCurrentIndex(0);
    setIsAnswerRevealed(false);
    setIsCompleted(false);
    setSessionAgain(0);
    setSessionHard(0);
    setSessionGood(0);
    setSessionEasy(0);
    setSaveError(null);
    setFailedReview(null);
    setIsEditingCard(false);
    setIsManualAddOpen(false);
    setManualDraft(undefined);
    setManualDuplicatePreview(null);
  }, []);

  const speakCurrentTerm = useCallback(() => {
    if (!currentCardTerm || !isSpeechSupported()) return;
    speakEnglish(currentCardTerm);
  }, [currentCardTerm]);

  const speakCurrentExample = useCallback(() => {
    if (!isAnswerRevealed || !currentCardExample || !isSpeechSupported()) return;
    speakEnglish(currentCardExample);
  }, [currentCardExample, isAnswerRevealed]);

  // Keyboard navigation: S = term, E = revealed example, Space = reveal,
  // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        isCompleted ||
        isStudyOverlayOpen ||
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.isComposing ||
        isTextEntryTarget(e.target)
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === "s") {
        e.preventDefault();
        speakCurrentTerm();
        return;
      }

      if (key === "e" && isAnswerRevealed && currentCardExample) {
        e.preventDefault();
        speakCurrentExample();
        return;
      }

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
  }, [
    currentCardExample,
    handleReveal,
    handleReviewAction,
    isAnswerRevealed,
    isCompleted,
    isStudyOverlayOpen,
    isSubmitting,
    mode,
    speakCurrentExample,
    speakCurrentTerm,
  ]);

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
          <div className="hidden justify-center gap-3 pt-2 sm:flex">
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
            className="hidden w-fit items-center gap-1.5 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] transition-all hover:bg-[#FAF6EE] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:inline-flex"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
            <span>{backHref ? backLabel : "Thoát study"}</span>
          </Link>

          <div className="flex items-center gap-2">
            {manualTargetDeckId ? (
              <button
                type="button"
                onClick={() => {
                  playUISound("softTap");
                  setIsManualAddOpen(true);
                }}
                className="wn-button wn-button-quiet gap-1.5 px-3 py-1.5 text-xs font-black"
              >
                <Plus className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" strokeWidth={2.5} />
                <span>Thêm từ</span>
              </button>
            ) : null}
            <span className="text-[11px] font-mono font-black uppercase tracking-wider text-[#6B6258] bg-[#FAF6EE] px-2.5 py-1 rounded-lg border-2 border-[#221C16] shadow-[1.5px_1.5px_0px_#221C16]">
              {mode === "scheduled-review" ? "Ôn tập" : "Luyện tự do"}
            </span>

            {/* Progress Indicator */}
            <div className="font-mono text-xs font-black text-[#221C16] bg-[#FFFDF9] px-2.5 py-1 rounded-lg border-2 border-[#221C16] shadow-[1.5px_1.5px_0px_#221C16]">
              {currentIndex + 1} / {totalCards}
            </div>
          </div>
        </div>

        {/* Tactile Progress Bar */}
        <div className="h-2.5 w-full overflow-hidden rounded-full border-2 border-[#221C16] bg-[#EDE6D8] p-0.5">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
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
          onEdit={isSubmitting ? undefined : () => setIsEditingCard(true)}
          onNextFreePractice={handleFreePracticeNext}
          mode={mode}
          reviewSchedule={reviewSchedule}
          isSubmitting={isSubmitting}
          submittingRating={submittingRating}
        />
      </div>

      {isEditingCard ? (
        <FlashcardEditorDialog
          card={currentCard}
          onClose={() => setIsEditingCard(false)}
          onSave={saveCurrentCardEdit}
        />
      ) : null}

      {isManualAddOpen && manualTargetDeckId ? (
        <StudyManualFlashcardDialog
          deckId={manualTargetDeckId}
          initialDraft={manualDraft}
          onClose={() => {
            setIsManualAddOpen(false);
            setManualDraft(undefined);
          }}
          onDuplicateFound={(draft, preview) => {
            setManualDraft(draft);
            setManualDuplicatePreview(preview);
            setIsManualAddOpen(false);
          }}
          onCreated={() => {
            setIsManualAddOpen(false);
            setManualDraft(undefined);
          }}
        />
      ) : null}

      {manualDuplicatePreview && manualTargetDeckId ? (
        <StudyManualDuplicateReviewDialog
          deckId={manualTargetDeckId}
          draft={manualDraft ?? { term: "", meaningVi: "" }}
          preview={manualDuplicatePreview}
          onBack={() => {
            setManualDuplicatePreview(null);
            setIsManualAddOpen(true);
          }}
          onClose={() => {
            setManualDuplicatePreview(null);
            setManualDraft(undefined);
          }}
        />
      ) : null}
    </div>
  );
}
