"use client";

import React, { useState } from "react";
import { StoryCefr, StoryLength, StoryTopic } from "@/lib/validation/story";
import { WordNestMascot } from "../ui/Mascot";
import {
  Sparkles,
  X,
  BookOpen,
  CheckSquare,
  Square,
  Loader2,
  Clock,
  Compass,
  GraduationCap,
} from "lucide-react";

interface StoryGeneratorModalProps {
  deckId: string;
  availableWords: string[];
  isOpen: boolean;
  onClose: () => void;
  onStoryGenerated: (storyId: string) => void;
}

export function StoryGeneratorModal({
  deckId,
  availableWords,
  isOpen,
  onClose,
  onStoryGenerated,
}: StoryGeneratorModalProps) {
  const [selectedWords, setSelectedWords] = useState<string[]>(availableWords);
  const [cefr, setCefr] = useState<StoryCefr>("B1");
  const [length, setLength] = useState<StoryLength>("medium");
  const [topic, setTopic] = useState<StoryTopic>("Daily Life");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleWord = (word: string) => {
    setSelectedWords((prev) =>
      prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word]
    );
  };

  const selectAll = () => setSelectedWords(availableWords);
  const deselectAll = () => setSelectedWords([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedWords.length === 0 || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId,
          targetWords: selectedWords,
          cefr,
          length,
          topic,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Không thể tạo câu chuyện");
      }

      onStoryGenerated(data.story.id);
      onClose();
    } catch (err) {
      console.error("Story generation failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi tạo câu chuyện."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const TOPICS: StoryTopic[] = [
    "Daily Life",
    "IT",
    "Travel",
    "Mystery",
    "Fantasy",
    "Random",
  ];

  const CEFRS: StoryCefr[] = ["A1", "A2", "B1", "B2", "C1"];

  const LENGTHS: { value: StoryLength; label: string; desc: string }[] = [
    { value: "short", label: "Ngắn (Short)", desc: "~100–150 từ" },
    { value: "medium", label: "Vừa (Medium)", desc: "~200–300 từ" },
    { value: "long", label: "Dài (Long)", desc: "~400–500 từ" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="brick-card p-5 sm:p-7 bg-[#FFFDF9] max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-5 shadow-[8px_8px_0px_#221C16] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#221C16] pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#FEF3C7] border-2 border-[#221C16] text-[#E06B43]">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[#221C16]">
                Tạo Short Story với AI
              </h2>
              <p className="text-xs text-[#6B6258] font-medium">
                Biến các từ vựng đã chọn thành một câu chuyện lôi cuốn
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border-2 border-[#221C16] hover:bg-gray-100 text-[#6B6258] hover:text-[#221C16]"
            aria-label="Đóng bảng tạo truyện"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Topic Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold uppercase tracking-wider text-[#221C16] flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#E06B43]" />
              Chủ đề (Topic)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopic(t)}
                  className={`py-2 px-3 text-xs font-extrabold rounded-xl border-2 border-[#221C16] transition-all text-center ${
                    topic === t
                      ? "bg-[#E06B43] text-white shadow-[2px_2px_0px_#221C16]"
                      : "bg-[#FAF6EE] text-[#221C16] hover:bg-[#FEF3C7]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* CEFR Level Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold uppercase tracking-wider text-[#221C16] flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-[#E06B43]" />
              Cấp độ ngôn ngữ (CEFR Level)
            </label>
            <div className="flex gap-2">
              {CEFRS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCefr(c)}
                  className={`flex-1 py-1.5 text-xs font-black rounded-xl border-2 border-[#221C16] transition-all text-center ${
                    cefr === c
                      ? "bg-[#221C16] text-white shadow-[2px_2px_0px_#E06B43]"
                      : "bg-[#FAF6EE] text-[#221C16] hover:bg-gray-100"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Length Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold uppercase tracking-wider text-[#221C16] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#E06B43]" />
              Độ dài câu chuyện (Length)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {LENGTHS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setLength(item.value)}
                  className={`p-2 rounded-xl border-2 border-[#221C16] transition-all text-left ${
                    length === item.value
                      ? "bg-[#FEF3C7] text-[#92400E] border-[#D97706] shadow-[2px_2px_0px_#221C16]"
                      : "bg-[#FAF6EE] text-[#221C16] hover:bg-gray-100"
                  }`}
                >
                  <div className="text-xs font-extrabold">{item.label}</div>
                  <div className="text-[10px] text-[#6B6258] mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Vocabulary Selection */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold uppercase tracking-wider text-[#221C16] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#E06B43]" />
                Từ vựng đưa vào truyện ({selectedWords.length}/{availableWords.length})
              </label>

              <div className="flex gap-2 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[#E06B43] hover:underline"
                >
                  Chọn tất cả
                </button>
                <span className="text-[#6B6258]">&bull;</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-[#6B6258] hover:underline"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            <div className="max-h-36 overflow-y-auto p-2.5 rounded-xl border-2 border-[#221C16] bg-[#FAF6EE] flex flex-wrap gap-1.5">
              {availableWords.map((word) => {
                const isChecked = selectedWords.includes(word);
                return (
                  <button
                    key={word}
                    type="button"
                    onClick={() => toggleWord(word)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border-2 transition-all flex items-center gap-1.5 ${
                      isChecked
                        ? "bg-[#FFFDF9] border-[#221C16] text-[#221C16] shadow-[1px_1px_0px_#221C16]"
                        : "bg-transparent border-[#221C16]/30 text-[#6B6258]"
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-[#16A34A]" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-[#6B6258]" />
                    )}
                    <span>{word}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-[#FEE2E2] border-2 border-[#EF4444] text-[#991B1B] text-xs font-bold">
              {errorMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] hover:bg-gray-100"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={selectedWords.length === 0 || isGenerating}
              className="brick-button-primary px-6 py-2.5 text-xs sm:text-sm font-black gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang viết câu chuyện...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Tạo câu chuyện (Generate Story)</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Modal Loading State */}
        {isGenerating && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-60 p-4">
            <div className="brick-card p-6 sm:p-8 bg-[#FFFDF9] max-w-sm w-full text-center space-y-4 shadow-[8px_8px_0px_#221C16] animate-in zoom-in-95">
              <div className="flex justify-center">
                <WordNestMascot mood="reading" size={100} className="animate-bounce" />
              </div>
              <h3 className="text-lg font-black text-[#221C16]">
                Nesty đang dệt câu chuyện...
              </h3>
              <p className="text-xs text-[#6B6258] font-medium leading-relaxed">
                Đang lồng ghép {selectedWords.length} từ vựng vào chủ đề &ldquo;{topic}&rdquo; (cấp độ {cefr}).
              </p>
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#E06B43] bg-[#FEF3C7] py-2 px-3 rounded-lg border border-[#221C16]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Khoảng vài giây...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
