"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Timer,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ExplainAnswerButton } from "@/components/ai/ExplainAnswerButton";
import { PronounceButton } from "@/components/flashcards/PronounceButton";
import type {
  SerializedDeckMistakesResult,
  MistakeFilter,
} from "@/services/vocabulary";

interface MistakeBankViewProps {
  deck: {
    id: string;
    name: string;
  };
  initialData?: SerializedDeckMistakesResult;
}

export function MistakeBankView({ deck, initialData }: MistakeBankViewProps) {
  const [filter, setFilter] = useState<MistakeFilter>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SerializedDeckMistakesResult | null>(initialData || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMistakes = useCallback(
    async (targetPage: number, targetFilter: MistakeFilter) => {
      setIsLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: targetPage.toString(),
          pageSize: "10",
          filter: targetFilter,
        });
        const res = await fetch(`/api/decks/${deck.id}/mistakes?${query.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Không thể tải danh sách câu sai.");
        }
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
      } finally {
        setIsLoading(false);
      }
    },
    [deck.id]
  );

  const handleFilterChange = (newFilter: MistakeFilter) => {
    setFilter(newFilter);
    setPage(1);
    void fetchMistakes(1, newFilter);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    void fetchMistakes(newPage, filter);
  };

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case "typed_vi_en":
        return "Gõ từ (Active Recall)";
      case "fill_in_blank":
        return "Điền từ vào câu";
      case "multiple_choice_vi_en":
      case "multiple_choice_en_vi":
        return "Trắc nghiệm";
      case "story_cloze":
        return "Điền từ trong truyện";
      case "story_contextual_vocab":
        return "Từ vựng ngữ cảnh truyện";
      default:
        return type;
    }
  };

  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const mistakes = data?.mistakes || [];
  const counts = data?.counts || { all: 0, needsPractice: 0, resolved: 0 };
  const totalPages = data?.totalPages || 1;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-2 border-stone-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/decks/${deck.id}`}
              className="inline-flex items-center gap-1 text-xs font-bold text-stone-600 hover:text-stone-900 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại {deck.name}</span>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 flex items-center gap-2">
            <span>Sổ tay câu sai</span>
            <span className="text-xs sm:text-sm font-black px-2.5 py-0.5 rounded-full bg-rose-200 border-2 border-stone-800 shadow-[1px_1px_0px_#1c1917]">
              {counts.all} lỗi
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-1">
            Lịch sử các lần trả lời chưa đúng và tiến độ khắc phục tự động của bạn.
          </p>
        </div>

        {mistakes.length > 0 ? (
          <Link
            href={`/decks/${deck.id}/quiz?mode=focused_practice&cardIds=${Array.from(
              new Set(mistakes.map((m) => m.flashcardId))
            ).join(",")}`}
          >
            <Button
              variant="primary"
              className="border-2 border-stone-800 bg-amber-400 hover:bg-amber-500 text-stone-900 font-black shadow-[3px_3px_0px_#1c1917] flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-900" />
              <span>
                Luyện lại {Array.from(new Set(mistakes.map((m) => m.flashcardId))).length} từ này
              </span>
            </Button>
          </Link>
        ) : (
          <Link href={`/decks/${deck.id}/quiz?mode=focused_practice`}>
            <Button
              variant="primary"
              disabled
              className="border-2 border-stone-800 bg-amber-400 text-stone-900 font-black shadow-[3px_3px_0px_#1c1917] flex items-center gap-2 opacity-50 cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4 text-amber-900" />
              <span>Luyện các câu này</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Overview Stat Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border-2 border-stone-800 bg-stone-100 shadow-[2px_2px_0px_#1c1917] flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-stone-500 block">Tổng số lần sai</span>
            <span className="text-xl font-black text-stone-900">{counts.all}</span>
          </div>
          <BookOpen className="w-6 h-6 text-stone-400" />
        </div>

        <div className="p-3.5 rounded-xl border-2 border-stone-800 bg-rose-50 shadow-[2px_2px_0px_#1c1917] flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-rose-600 block">Cần củng cố thêm</span>
            <span className="text-xl font-black text-rose-900">{counts.needsPractice}</span>
          </div>
          <AlertCircle className="w-6 h-6 text-rose-400" />
        </div>

        <div className="p-3.5 rounded-xl border-2 border-stone-800 bg-emerald-50 shadow-[2px_2px_0px_#1c1917] flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-600 block">Đã khắc phục tốt</span>
            <span className="text-xl font-black text-emerald-900">{counts.resolved}</span>
          </div>
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-stone-600">
          <Filter className="w-3.5 h-3.5" />
          <span>Bộ lọc:</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {[
            { id: "ALL", label: `Tất cả (${counts.all})` },
            { id: "NEEDS_PRACTICE", label: `Cần luyện thêm (${counts.needsPractice})` },
            { id: "RECENT_MISTAKES", label: "7 ngày gần đây" },
            { id: "RESOLVED", label: `Đã khắc phục (${counts.resolved})` },
            { id: "TYPED", label: "Gõ từ" },
            { id: "FILL_IN_BLANK", label: "Điền từ" },
            { id: "MULTIPLE_CHOICE", label: "Trắc nghiệm" },
            { id: "STORY_CLOZE", label: "Story Cloze" },
            { id: "STORY_CONTEXTUAL_VOCAB", label: "Ngữ cảnh truyện" },
          ].map((tab) => {
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleFilterChange(tab.id as MistakeFilter)}
                className={`px-3 py-1.5 rounded-lg border-2 text-xs font-black shrink-0 transition-all select-none ${
                  isActive
                    ? "border-stone-800 bg-stone-900 text-amber-300 shadow-[2px_2px_0px_#1c1917]"
                    : "border-stone-800 bg-white text-stone-700 hover:bg-stone-100 shadow-[1px_1px_0px_#1c1917]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-100 border-2 border-red-800 rounded-xl text-red-900 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button size="sm" variant="danger" onClick={() => fetchMistakes(page, filter)}>
            Thử lại
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-stone-500">
          <RotateCcw className="w-6 h-6 animate-spin text-stone-700" />
          <p className="text-sm font-bold">Đang tải danh sách câu sai...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && mistakes.length === 0 && (
        <div className="p-8 text-center border-2 border-dashed border-stone-400 rounded-2xl bg-amber-50/50 space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 border-2 border-stone-800 mx-auto flex items-center justify-center text-emerald-700 font-black text-xl shadow-[2px_2px_0px_#1c1917]">
            ✓
          </div>
          <h3 className="text-lg font-black text-stone-900">
            {filter === "ALL"
              ? "Tuyệt vời! Bạn chưa có câu sai nào trong bộ từ này."
              : "Không tìm thấy câu sai nào phù hợp với bộ lọc hiện tại."}
          </h3>
          <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto">
            {filter === "ALL"
              ? "Hãy tiếp tục duy trì phong độ qua các lượt ôn luyện hằng ngày!"
              : "Thử chuyển sang bộ lọc khác hoặc tiếp tục luyện tập."}
          </p>
          <Link href={`/decks/${deck.id}/quiz?mode=focused_practice`}>
            <Button size="sm" variant="secondary" className="mt-2 border-2 border-stone-800">
              Luyện tập ngay
            </Button>
          </Link>
        </div>
      )}

      {/* Mistakes List */}
      {!isLoading && mistakes.length > 0 && (
        <div className="space-y-4">
          {mistakes.map((item) => (
            <div
              key={item.id}
              className="p-4 sm:p-5 rounded-xl border-2 border-stone-800 bg-white shadow-[3px_3px_0px_#1c1917] space-y-3 transition-all hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_#1c1917]"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-black text-stone-900 tracking-tight">
                    {item.term}
                  </span>
                  {item.ipa && (
                    <span className="text-xs font-mono text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-300">
                      {item.ipa}
                    </span>
                  )}
                  {item.partOfSpeech && (
                    <span className="text-[11px] font-bold text-stone-600 italic">
                      ({item.partOfSpeech})
                    </span>
                  )}
                  <PronounceButton text={item.term} size="sm" />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status Badge */}
                  <span
                    className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border-2 border-stone-800 shadow-[1px_1px_0px_#1c1917] ${
                      item.derivedStatus === "RESOLVED"
                        ? "bg-emerald-200 text-emerald-950"
                        : item.derivedStatus === "IMPROVING"
                        ? "bg-amber-200 text-amber-950"
                        : "bg-rose-200 text-rose-950"
                    }`}
                  >
                    {item.derivedStatus === "RESOLVED"
                      ? "✓ Đã khắc phục"
                      : item.derivedStatus === "IMPROVING"
                      ? "⚡ Đang tiến bộ"
                      : "✕ Cần luyện tập"}
                  </span>

                  {/* Question type badge */}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-300">
                    {getQuestionTypeLabel(item.questionType)}
                  </span>
                </div>
              </div>

              {/* Meaning & Status Note */}
              <div className="text-xs space-y-1">
                <p className="font-semibold text-stone-800">
                  <span className="text-stone-500 font-normal">Nghĩa: </span>
                  {item.meaningVi}
                </p>
                {item.statusExplanationVi && (
                  <p className="text-[11px] font-medium text-stone-500 italic">
                    Tình trạng học: {item.statusExplanationVi}
                  </p>
                )}
              </div>

              {/* Prompt if any */}
              {item.prompt && (
                <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-xs">
                  <span className="font-bold text-stone-500 block text-[10px] uppercase tracking-wider">
                    Câu hỏi / Ngữ cảnh:
                  </span>
                  <p className="font-medium text-stone-900 mt-0.5">{item.prompt}</p>
                </div>
              )}

              {/* User Answer vs Expected Answer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-rose-50/80 p-2.5 rounded-lg border border-rose-200">
                  <span className="font-bold text-rose-700 block text-[10px] uppercase tracking-wider">
                    Bạn đã trả lời:
                  </span>
                  <span className="font-black text-rose-900 line-through">
                    {item.userAnswer || "(Để trống)"}
                  </span>
                </div>

                <div className="bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-200">
                  <span className="font-bold text-emerald-700 block text-[10px] uppercase tracking-wider">
                    Đáp án đúng:
                  </span>
                  <span className="font-black text-emerald-900">
                    {item.expectedAnswer}
                  </span>
                </div>
              </div>

              {/* Meta & Actions Footer */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-stone-100">
                <div className="flex items-center gap-3 text-[11px] text-stone-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDateTime(item.createdAt)}</span>
                  </span>
                  {item.responseMs && (
                    <span className="flex items-center gap-1">
                      <Timer className="w-3.5 h-3.5" />
                      <span>{(item.responseMs / 1000).toFixed(1)}s</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/decks/${deck.id}/quiz?mode=focused_practice&cardIds=${item.flashcardId}`}
                    title="Luyện lại từ này"
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      className="border-2 border-stone-800 text-xs font-bold shadow-[1px_1px_0px_#1c1917]"
                    >
                      Luyện từ này
                    </Button>
                  </Link>
                  <ExplainAnswerButton
                    practiceAttemptId={item.id}
                    flashcardId={item.flashcardId}
                    userAnswer={item.userAnswer}
                    expectedAnswer={item.expectedAnswer}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                className="border-2 border-stone-800"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                <span>Trang trước</span>
              </Button>

              <span className="text-xs font-bold text-stone-700">
                Trang {page} / {totalPages}
              </span>

              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                className="border-2 border-stone-800"
              >
                <span>Trang sau</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
