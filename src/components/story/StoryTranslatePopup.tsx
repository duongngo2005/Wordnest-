"use client";

import React, { useState } from "react";
import { PronounceButton } from "../flashcards/PronounceButton";
import { ContextualTranslationResponse } from "@/lib/validation/story";
import {
  X,
  PlusCircle,
  CheckCircle,
  AlertCircle,
  Loader2,
  BookOpen,
  Sparkles,
} from "lucide-react";

interface StoryTranslatePopupProps {
  deckId: string;
  translation: ContextualTranslationResponse | null;
  isLoading: boolean;
  onClose: () => void;
  onCardAdded?: () => void;
}

export function StoryTranslatePopup({
  deckId,
  translation,
  isLoading,
  onClose,
  onCardAdded,
}: StoryTranslatePopupProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [addStatus, setAddStatus] = useState<"idle" | "success" | "exists" | "error">("idle");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isLoading && !translation) {
    return null;
  }

  const handleAddToFlashcards = async () => {
    if (!translation || isAdding) return;
    setIsAdding(true);
    setAddStatus("idle");
    setFeedbackMessage(null);

    try {
      const res = await fetch("/api/stories/add-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId,
          term: translation.selectedText,
          meaningVi: translation.contextualMeaningVi || translation.meaningVi,
          definitionEn: translation.definitionEn,
          ipa: translation.ipa,
          partOfSpeech: translation.partOfSpeech,
          cefr: translation.cefr,
          exampleEn: translation.exampleEn,
          exampleVi: translation.exampleVi,
        }),
      });

      const data = await res.json();

      if (res.status === 409 || data.alreadyExists) {
        setAddStatus("exists");
        setFeedbackMessage(data.message || "Từ này đã có trong bộ thẻ!");
      } else if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể thêm thẻ");
      } else {
        setAddStatus("success");
        setFeedbackMessage(data.message || "Đã thêm thẻ mới thành công!");
        onCardAdded?.();
      }
    } catch (err) {
      console.error("Failed to add card from story:", err);
      setAddStatus("error");
      setFeedbackMessage(
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi lưu thẻ."
      );
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="brick-card p-5 sm:p-6 bg-[#FFFDF9] max-w-lg w-full max-h-[85vh] overflow-y-auto space-y-4 shadow-[8px_8px_0px_#221C16] animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-150 rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#221C16] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-[#FEF3C7] border border-[#221C16] text-[#E06B43]">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#221C16]">
              Dịch theo ngữ cảnh (Contextual Translation)
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[#221C16] hover:bg-gray-100 text-[#6B6258] hover:text-[#221C16]"
            aria-label="Đóng bảng dịch"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#E06B43] mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-[#6B6258]">
              Đang phân tích nghĩa trong ngữ cảnh câu văn...
            </p>
          </div>
        ) : translation ? (
          <div className="space-y-4">
            {/* Term, IPA, Audio */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-2xl font-black text-[#221C16] tracking-tight">
                    {translation.selectedText}
                  </h3>
                  {translation.partOfSpeech && (
                    <span className="text-xs font-bold italic text-[#6B6258] bg-[#FAF6EE] px-2 py-0.5 rounded border border-[#221C16]/20">
                      {translation.partOfSpeech}
                    </span>
                  )}
                  {translation.cefr && (
                    <span className="brick-badge bg-[#E06B43] text-white">
                      {translation.cefr}
                    </span>
                  )}
                </div>
                {translation.ipa && (
                  <p className="text-sm font-mono text-[#6B6258] mt-0.5">
                    {translation.ipa}
                  </p>
                )}
              </div>

              <PronounceButton text={translation.selectedText} size="sm" label="Nghe" />
            </div>

            {/* Meanings */}
            <div className="space-y-2">
              {/* Contextual Meaning */}
              <div className="p-3 rounded-xl bg-[#FEF3C7] border-2 border-[#D97706]/60">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#B45309] mb-0.5">
                  Nghĩa trong câu này:
                </div>
                <p className="text-base sm:text-lg font-black text-[#221C16]">
                  {translation.contextualMeaningVi}
                </p>
              </div>

              {/* Dictionary Meaning & Definition */}
              <div className="p-3 rounded-xl bg-[#FAF6EE] border-2 border-[#221C16]/30">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B6258] mb-0.5">
                  Nghĩa từ điển chung:
                </div>
                <p className="text-sm font-bold text-[#221C16]">
                  {translation.meaningVi}
                </p>
                <p className="text-xs text-[#6B6258] mt-0.5 italic">
                  {translation.definitionEn}
                </p>
              </div>
            </div>

            {/* Sentence in context */}
            <div className="p-3 rounded-xl bg-[#FFFDF9] border-2 border-[#221C16] space-y-1.5 shadow-[2px_2px_0px_#221C16]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B6258] flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  Câu gốc chứa từ
                </span>
                <PronounceButton text={translation.exampleEn} size="sm" />
              </div>
              <p className="text-sm font-semibold text-[#221C16] leading-snug">
                &ldquo;{translation.exampleEn}&rdquo;
              </p>
              <p className="text-xs text-[#6B6258] font-medium leading-snug">
                &rarr; {translation.exampleVi}
              </p>
            </div>

            {/* Feedback Alert */}
            {feedbackMessage && (
              <div
                className={`p-2.5 rounded-lg border-2 text-xs font-bold flex items-center gap-2 ${
                  addStatus === "success"
                    ? "bg-[#DCFCE7] border-[#16A34A] text-[#15803D]"
                    : addStatus === "exists"
                    ? "bg-[#FEF3C7] border-[#D97706] text-[#B45309]"
                    : "bg-[#FEE2E2] border-[#EF4444] text-[#B91C1C]"
                }`}
              >
                {addStatus === "success" && <CheckCircle className="w-4 h-4 shrink-0" />}
                {addStatus === "exists" && <AlertCircle className="w-4 h-4 shrink-0" />}
                {addStatus === "error" && <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{feedbackMessage}</span>
              </div>
            )}

            {/* Action: Add to Flashcards */}
            <div className="pt-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-bold rounded-lg border-2 border-[#221C16] bg-[#FFFDF9] hover:bg-gray-100"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={handleAddToFlashcards}
                disabled={isAdding || addStatus === "success"}
                className={`px-4 py-2 text-xs sm:text-sm font-black rounded-lg border-2 border-[#221C16] flex items-center gap-1.5 shadow-[2px_2px_0px_#221C16] active:translate-y-0.5 transition-all ${
                  addStatus === "success"
                    ? "bg-[#10B981] text-white cursor-default"
                    : "bg-[#E06B43] text-white hover:bg-[#EA580C]"
                }`}
              >
                {isAdding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : addStatus === "success" ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Đã thêm vào Flashcards ✓</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Add to Flashcards</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
