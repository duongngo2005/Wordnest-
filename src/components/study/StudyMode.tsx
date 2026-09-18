"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { FlashcardData } from "../flashcards/FlashcardItem";
import { PronounceButton } from "../flashcards/PronounceButton";
import { FlashcardStatus } from "@prisma/client";
import {
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { WordNestMascot } from "../ui/Mascot";

interface StudyModeProps {
  deckId: string;
  deckName: string;
  initialCards: FlashcardData[];
}

export function StudyMode({ deckId, deckName, initialCards }: StudyModeProps) {
  const [cards, setCards] = useState<FlashcardData[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Session summary counters
  const [sessionKnown, setSessionKnown] = useState(0);
  const [sessionLearning, setSessionLearning] = useState(0);

  const totalCards = cards.length;
  const currentCard = cards[currentIndex];

  const updateCardStatusOnServer = async (cardId: string, status: FlashcardStatus) => {
    try {
      await fetch(`/api/cards/${cardId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error("Failed to update status on server:", err);
    }
  };

  const handleAction = React.useCallback(
    async (action: "again" | "know") => {
      if (isSubmitting || !currentCard) return;
      setIsSubmitting(true);

      const newStatus =
        action === "again" ? FlashcardStatus.LEARNING : FlashcardStatus.KNOWN;

      if (action === "again") {
        setSessionLearning((prev) => prev + 1);
      } else {
        setSessionKnown((prev) => prev + 1);
      }

      // Update local cards state
      setCards((prev) =>
        prev.map((c, i) => (i === currentIndex ? { ...c, status: newStatus } : c))
      );

      // Persist to MySQL in background
      await updateCardStatusOnServer(currentCard.id, newStatus);

      // Proceed to next card or complete
      if (currentIndex + 1 < totalCards) {
        setCurrentIndex((prev) => prev + 1);
        setIsAnswerRevealed(false);
      } else {
        setIsCompleted(true);
      }
      setIsSubmitting(false);
    },
    [isSubmitting, currentCard, currentIndex, totalCards]
  );

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsAnswerRevealed(false);
    setIsCompleted(false);
    setSessionKnown(0);
    setSessionLearning(0);
  };

  // Keyboard navigation: Space = Reveal, 1 = Again, 2 = Know
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCompleted) return;

      if (e.code === "Space" && !isAnswerRevealed) {
        e.preventDefault();
        setIsAnswerRevealed(true);
      } else if (isAnswerRevealed) {
        if (e.key === "1" || e.code === "Digit1") {
          e.preventDefault();
          handleAction("again");
        } else if (e.key === "2" || e.code === "Digit2") {
          e.preventDefault();
          handleAction("know");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswerRevealed, isCompleted, handleAction]);

  // If deck is empty
  if (!cards || cards.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="brick-card p-8 bg-[#FFFDF9] space-y-4">
          <WordNestMascot mood="thinking" size={96} />
          <h2 className="text-xl font-black text-[#221C16]">
            Bộ từ vựng này chưa có thẻ nào!
          </h2>
          <p className="text-sm text-[#6B6258]">
            Hãy thêm từ vựng vào bộ thẻ để bắt đầu học.
          </p>
          <Link
            href={`/decks/${deckId}`}
            className="brick-button-primary px-5 py-2.5 text-sm font-bold inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại bộ thẻ
          </Link>
        </div>
      </div>
    );
  }

  // Completion screen
  if (isCompleted) {
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
              Bạn vừa hoàn tất phiên học cho bộ từ vựng:{" "}
              <strong className="text-[#221C16]">{deckName}</strong>
            </p>
          </div>

          {/* Session Results */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-xl border-2 border-[#16A34A] bg-[#DCFCE7] text-center shadow-[2px_2px_0px_#16A34A]">
              <div className="text-2xl sm:text-3xl font-black text-[#15803D]">
                {sessionKnown}
              </div>
              <div className="text-xs font-extrabold text-[#15803D] uppercase tracking-wider mt-0.5">
                Đã thuộc (Know)
              </div>
            </div>

            <div className="p-3.5 rounded-xl border-2 border-[#D97706] bg-[#FEF3C7] text-center shadow-[2px_2px_0px_#D97706]">
              <div className="text-2xl sm:text-3xl font-black text-[#B45309]">
                {sessionLearning}
              </div>
              <div className="text-xs font-extrabold text-[#B45309] uppercase tracking-wider mt-0.5">
                Cần ôn lại (Again)
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2.5">
            <button
              onClick={handleRestart}
              className="brick-button-primary w-full py-3 text-sm font-black gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Luyện tập lại lần nữa
            </button>
            <Link
              href={`/decks/${deckId}`}
              className="brick-button-secondary w-full py-3 text-sm font-bold gap-2 text-center"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại danh sách thẻ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4 space-y-5">
      {/* Top Header & Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Link
            href={`/decks/${deckId}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#6B6258] hover:text-[#221C16] p-1 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Thoát Study</span>
          </Link>

          {/* Progress Indicator: e.g. 3 / 20 */}
          <div className="brick-badge bg-[#FAF6EE] text-[#221C16] font-mono text-sm px-3 py-1">
            {currentIndex + 1} / {totalCards}
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full h-3 bg-[#E5E0D5] rounded-full border-2 border-[#221C16] overflow-hidden">
          <div
            className="h-full bg-[#E06B43] transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Flashcard in Study Mode */}
      <div className="brick-card p-6 sm:p-8 bg-[#FFFDF9] min-h-[360px] sm:min-h-[420px] flex flex-col justify-between shadow-[6px_6px_0px_#221C16]">
        {/* Front of Card (Always Visible) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {currentCard.cefr && (
                <span className="brick-badge bg-[#E06B43] text-white">
                  {currentCard.cefr}
                </span>
              )}
              {currentCard.partOfSpeech && (
                <span className="text-xs font-bold italic text-[#6B6258] bg-[#FAF6EE] px-2 py-0.5 rounded border border-[#221C16]/20">
                  {currentCard.partOfSpeech}
                </span>
              )}
            </div>

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
            </div>
          )}

          {/* Back / Revealed Answer */}
          {isAnswerRevealed ? (
            <div className="space-y-4 pt-4 border-t-2 border-[#221C16] animate-in fade-in duration-200">
              {/* Vietnamese Meaning */}
              <div className="p-3.5 rounded-xl bg-[#FAF6EE] border-2 border-[#221C16]/40">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#E06B43] mb-0.5">
                  Nghĩa tiếng Việt
                </div>
                <p className="text-lg sm:text-xl font-extrabold text-[#221C16]">
                  {currentCard.meaningVi}
                </p>
                <p className="text-xs sm:text-sm text-[#6B6258] mt-1 italic">
                  {currentCard.definitionEn}
                </p>
              </div>

              {/* Example Sentence */}
              <div className="p-3.5 rounded-xl bg-[#FFFDF9] border-2 border-[#221C16] space-y-1.5 shadow-[2px_2px_0px_#221C16]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B6258]">
                    Ví dụ minh họa
                  </span>
                  <PronounceButton text={currentCard.exampleEn} size="sm" />
                </div>
                <p className="text-sm font-semibold text-[#221C16]">
                  &ldquo;{currentCard.exampleEn}&rdquo;
                </p>
                <p className="text-xs text-[#6B6258] font-medium">
                  &rarr; {currentCard.exampleVi}
                </p>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-[#6B6258] italic">
              Nhấn &ldquo;Hiện đáp án&rdquo; hoặc phím Space để kiểm tra nghĩa và câu ví dụ
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="pt-6">
          {!isAnswerRevealed ? (
            <button
              onClick={() => setIsAnswerRevealed(true)}
              className="brick-button-secondary w-full py-3.5 text-base font-black shadow-[4px_4px_0px_#221C16]"
            >
              Hiện đáp án (Show Answer)
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Again Button -> LEARNING */}
              <button
                onClick={() => handleAction("again")}
                disabled={isSubmitting}
                className="brick-button-secondary py-3.5 text-sm sm:text-base font-black bg-[#FEF3C7] text-[#B45309] border-[#B45309] flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Again (Chưa nhớ)</span>
                <span className="text-[10px] bg-[#B45309]/15 px-1 rounded font-mono hidden sm:inline">
                  [1]
                </span>
              </button>

              {/* Know Button -> KNOWN */}
              <button
                onClick={() => handleAction("know")}
                disabled={isSubmitting}
                className="brick-button-success py-3.5 text-sm sm:text-base font-black flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Know (Đã thuộc)</span>
                <span className="text-[10px] bg-black/20 px-1 rounded font-mono hidden sm:inline">
                  [2]
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
