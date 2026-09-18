"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseVocabularyInput, MAX_VOCABULARY_TERMS } from "@/services/vocabulary/parser";
import { Sparkles, BookOpen, AlertCircle, Loader2, FileUp } from "lucide-react";
import { WordNestMascot } from "../ui/Mascot";

const SAMPLE_INPUT = "apple; resilient; take responsibility; cloud computing; reluctant";

export function BulkInputForm() {
  const router = useRouter();
  const [deckName, setDeckName] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Parse input live
  const parseResult = parseVocabularyInput(rawInput, MAX_VOCABULARY_TERMS);
  const { terms, error: parseError, duplicateCount } = parseResult;
  const count = terms.length;
  const isValid = count > 0 && !parseError;

  const handleFillSample = () => {
    setRawInput(SAMPLE_INPUT);
    if (!deckName) setDeckName("Sample Vocabulary");
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isPending) return;

    setErrorMessage(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawInput,
            deckName: deckName.trim() || undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Không thể tạo flashcards. Vui lòng thử lại.");
        }

        // Successfully created deck, navigate to deck view
        router.push(`/decks/${data.deck.id}`);
      } catch (err) {
        console.error("Submission failed:", err);
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Đã xảy ra lỗi không xác định. Vui lòng kiểm tra lại kết nối."
        );
      }
    });
  };

  return (
    <div className="brick-card p-5 sm:p-7 bg-[#FFFDF9] space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b-2 border-[#221C16]">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-[#221C16] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#E06B43]" />
            Nhập danh sách từ vựng
          </h2>
          <p className="text-xs sm:text-sm text-[#6B6258] mt-0.5">
            Nhập các từ hoặc cụm từ, phân cách nhau bằng dấu chấm phẩy{" "}
            <code className="font-mono bg-[#FEF3C7] px-1 py-0.5 rounded border border-[#221C16]/30 font-bold">
              ;
            </code>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/import"
            className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-[#221C16] bg-[#E0F2FE] hover:bg-[#BAE6FD] text-[#0369A1] shadow-[2px_2px_0px_#221C16] active:translate-y-0.5 transition-all flex items-center gap-1.5"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Nhập từ PDF / Word / TXT</span>
          </Link>

          <button
            type="button"
            onClick={handleFillSample}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-[#221C16] bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#92400E] shadow-[2px_2px_0px_#221C16] active:translate-y-0.5 transition-all"
          >
            Nhập mẫu
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Optional Deck Name */}
        <div>
          <label
            htmlFor="deck-name"
            className="block text-xs font-extrabold text-[#221C16] uppercase tracking-wider mb-1"
          >
            Tên bộ từ vựng (tùy chọn)
          </label>
          <input
            id="deck-name"
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="Ví dụ: My Vocabulary, Oxford 3000, IELTS Topic 1..."
            disabled={isPending}
            className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#221C16] text-sm bg-[#FAF6EE] font-semibold text-[#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43] shadow-[2px_2px_0px_#221C16]"
          />
        </div>

        {/* Textarea for Bulk Vocabulary */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="vocabulary-input"
              className="text-xs font-extrabold text-[#221C16] uppercase tracking-wider"
            >
              Danh sách từ vựng
            </label>

            {/* Counter and Detection Indicator */}
            <div className="flex items-center gap-2 text-xs font-bold">
              {duplicateCount > 0 && (
                <span className="text-[#B45309] bg-[#FEF3C7] px-2 py-0.5 rounded border border-[#D97706]/40">
                  {duplicateCount} từ trùng lặp đã gộp
                </span>
              )}
              <span
                className={`px-2.5 py-0.5 rounded-full border-2 border-[#221C16] font-mono text-xs font-black ${
                  count > 0 && !parseError
                    ? "bg-[#DCFCE7] text-[#15803D]"
                    : count > MAX_VOCABULARY_TERMS
                    ? "bg-[#FEE2E2] text-[#B91C1C]"
                    : "bg-[#FAF6EE] text-[#6B6258]"
                }`}
              >
                {count} / {MAX_VOCABULARY_TERMS} terms detected
              </span>
            </div>
          </div>

          <textarea
            id="vocabulary-input"
            rows={5}
            value={rawInput}
            onChange={(e) => {
              setRawInput(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            disabled={isPending}
            placeholder="apple; resilient; take responsibility; cloud computing; reluctant"
            className="w-full p-3.5 rounded-xl border-2 border-[#221C16] text-sm sm:text-base font-medium bg-[#FAF6EE] text-[#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43] shadow-[3px_3px_0px_#221C16] resize-y min-h-[120px]"
          />
        </div>

        {/* Validation or Server Error */}
        {(parseError || errorMessage) && (
          <div className="p-3.5 rounded-xl bg-[#FEE2E2] border-2 border-[#EF4444] text-[#991B1B] text-xs sm:text-sm font-bold flex items-start gap-2.5 shadow-[2px_2px_0px_#EF4444]">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#B91C1C]" />
            <p className="leading-snug">{parseError || errorMessage}</p>
          </div>
        )}

        {/* Preview of Detected Terms */}
        {count > 0 && !parseError && (
          <div className="p-3 rounded-xl bg-[#FAF6EE] border-2 border-[#221C16]/30 space-y-1.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#6B6258]">
              Từ vựng đã nhận diện ({count}):
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {terms.map((term, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-md bg-[#FFFDF9] border border-[#221C16] text-[#221C16] shadow-[1px_1px_0px_#221C16]"
                >
                  {term}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Button & Loading Feedback */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-[#6B6258] font-medium flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#E06B43]" />
            AI sẽ tự động tìm nghĩa chuẩn, IPA, ví dụ và hình ảnh minh họa.
          </div>

          <button
            type="submit"
            disabled={!isValid || isPending}
            className="brick-button-primary w-full sm:w-auto px-6 py-3 text-sm sm:text-base gap-2 font-black"
          >
            {isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Đang tạo flashcards ({count} từ)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generate Flashcards</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Loading Modal / Backdrop for visual feedback during generation */}
      {isPending && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="brick-card p-6 sm:p-8 bg-[#FFFDF9] max-w-sm w-full text-center space-y-4 shadow-[8px_8px_0px_#221C16] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-center">
              <WordNestMascot mood="thinking" size={96} className="animate-bounce" />
            </div>
            <h3 className="text-lg font-black text-[#221C16]">
              Nesty đang tạo thẻ học...
            </h3>
            <p className="text-xs sm:text-sm text-[#6B6258] font-medium leading-relaxed">
              Đang phân tích nghĩa tiếng Việt, phiên âm IPA, câu ví dụ thực tế và tìm kiếm hình ảnh minh họa cho {count} từ vựng.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#E06B43] bg-[#FEF3C7] py-2 px-3 rounded-lg border border-[#221C16]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Vui lòng đợi giây lát</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
