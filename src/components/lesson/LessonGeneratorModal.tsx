"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, Sparkles, Target, X } from "lucide-react";
import { StoryCefr } from "@/lib/validation/story";
import { useAiTasks } from "@/components/ai/AiTaskProvider";
import { toast } from "sonner";
import { playUISound } from "@/lib/ui-sound";

export type LessonDeckWord = {
  id: string;
  term: string;
  meaningVi: string;
  partOfSpeech?: string | null;
  cefr?: string | null;
};

export type LessonGeneratorModalProps = {
  open: boolean;
  deck: { id: string; name: string };
  words: LessonDeckWord[];
  initialSelectedIds?: string[];
  weakWordIds?: string[];
  onClose: () => void;
  onLessonCreated?: (lessonId: string) => void;
};

const CEFR_OPTIONS: StoryCefr[] = ["A1", "A2", "B1", "B2", "C1"];

const TOPIC_PRESETS = [
  "Everyday Communication & Life",
  "Workplace & Professional Situations",
  "Technology & Modern Society",
  "Travel & Cultural Exchange",
  "Academic & Informational Article",
];

export function LessonGeneratorModal(props: LessonGeneratorModalProps) {
  if (!props.open) return null;
  return <LessonGeneratorModalContent {...props} />;
}

function LessonGeneratorModalContent({
  deck,
  words,
  initialSelectedIds = [],
  weakWordIds = [],
  onClose,
  onLessonCreated,
}: LessonGeneratorModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { refreshJobs } = useAiTasks();

  const [selectedWordIds, setSelectedWordIds] = useState<string[]>(() => {
    if (initialSelectedIds.length > 0) return initialSelectedIds;
    if (weakWordIds.length > 0) return weakWordIds.slice(0, 8);
    return words.slice(0, 5).map((w) => w.id);
  });
  const [cefr, setCefr] = useState<StoryCefr>("B1");
  const [topic, setTopic] = useState("Everyday Communication & Life");
  const [search, setSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog open/close lifecycle
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const filteredWords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return words;
    return words.filter(
      (w) =>
        w.term.toLowerCase().includes(q) ||
        w.meaningVi.toLowerCase().includes(q) ||
        (w.partOfSpeech && w.partOfSpeech.toLowerCase().includes(q))
    );
  }, [words, search]);

  const selectedSet = useMemo(() => new Set(selectedWordIds), [selectedWordIds]);

  const toggleWord = (id: string) => {
    playUISound("softTap");
    setSelectedWordIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 20) {
        toast.warning("Chỉ nên chọn tối đa 20 từ vựng cho một bài học.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const selectAll = () => {
    playUISound("softTap");
    if (words.length > 20) {
      toast.info("Đã chọn tối đa 20 từ đầu tiên để đảm bảo chất lượng bài học.");
    }
    setSelectedWordIds(words.slice(0, 20).map((w) => w.id));
  };

  const deselectAll = () => {
    playUISound("softTap");
    setSelectedWordIds([]);
  };

  const selectWeakWords = () => {
    playUISound("softTap");
    if (weakWordIds.length > 0) {
      setSelectedWordIds(weakWordIds.slice(0, 20));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedWordIds.length === 0) {
      setError("Vui lòng chọn ít nhất 1 từ vựng cho bài học.");
      return;
    }
    if (selectedWordIds.length > 20) {
      setError("Mỗi bài học chỉ nên tập trung tối đa 20 từ vựng để đảm bảo chất lượng.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/decks/${deck.id}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetWords: selectedWordIds,
          cefr,
          topic: topic.trim() || undefined,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Không thể khởi tạo bài học AI.");
      }

      toast.success("Đã đưa bài học AI vào hàng đợi xử lý!", {
        description: "Bạn có thể theo dõi tiến trình trên thanh công cụ.",
      });

      // Refresh background tasks
      await refreshJobs();

      onLessonCreated?.(data.jobId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi tạo bài học.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="lesson-modal-title"
      className="story-workbench m-auto max-h-[90dvh] w-[min(calc(100%_-_1rem),46rem)] overflow-hidden p-0 text-[#221C16] backdrop:bg-[#221C16]/45"
      onCancel={(e) => {
        e.preventDefault();
        if (!isSubmitting) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <form onSubmit={handleSubmit} className="flex max-h-[90dvh] flex-col">
        {/* Header */}
        <header className="story-workbench-header shrink-0 flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
          <div>
            <div className="story-workbench-studs" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="story-workbench-kicker">AI Lesson Studio · {deck.name}</p>
            <h2
              id="lesson-modal-title"
              className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight sm:text-2xl"
            >
              <Sparkles className="h-5 w-5 text-[var(--accent)]" />
              <span>Tạo bài học AI từ từ vựng</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="wn-button wn-button-quiet wn-icon-button shrink-0"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {error && (
            <div className="rounded-xl border-2 border-rose-600 bg-rose-50 p-3 text-xs font-bold text-rose-800">
              {error}
            </div>
          )}

          {/* Section 1: Choose target words */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-black text-[#221C16]">
                1. Chọn từ vựng mục tiêu ({selectedWordIds.length}/{words.length})
                <span className="ml-2 text-xs font-semibold text-[#6B6258]">
                  (Khuyến nghị: 3 – 8 từ)
                </span>
              </label>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                {weakWordIds.length > 0 && (
                  <button
                    type="button"
                    onClick={selectWeakWords}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#221C16] bg-[#FEF3C7] px-2 py-1 text-[#92400E] hover:bg-[#FDE68A]"
                  >
                    <Target className="h-3 w-3" />
                    <span>Chọn từ yếu ({weakWordIds.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={selectAll}
                  className="rounded-lg border border-[#221C16] bg-[#FFFDF9] px-2 py-1 hover:bg-[#F5EEDB]"
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="rounded-lg border border-[#221C16] bg-[#FFFDF9] px-2 py-1 text-[#6B6258] hover:bg-[#F5EEDB]"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            {/* Word filter */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B6258]" />
              <input
                type="text"
                placeholder="Tìm từ vựng trong bộ thẻ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] py-1.5 pl-8 pr-3 text-xs font-semibold placeholder:text-[#9A9187] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            {/* Word Selection Chips */}
            <div
              className="max-h-48 overflow-y-auto rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2.5 flex flex-wrap gap-1.5"
              role="group"
              aria-label="Danh sách từ vựng"
            >
              {filteredWords.length === 0 ? (
                <p className="p-3 text-center text-xs font-semibold text-[#6B6258]">
                  Không tìm thấy từ vựng phù hợp.
                </p>
              ) : (
                filteredWords.map((word) => {
                  const isSelected = selectedSet.has(word.id);
                  const isWeak = weakWordIds.includes(word.id);
                  return (
                    <button
                      key={word.id}
                      type="button"
                      onClick={() => toggleWord(word.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs font-bold transition-all ${
                        isSelected
                          ? "border-[#221C16] bg-[#221C16] text-[#FFFDF9] shadow-[1px_1px_0px_#221C16]"
                          : "border-[#D8CEBE] bg-[#FFFDF9] text-[#221C16] hover:border-[#221C16]"
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border ${
                          isSelected
                            ? "border-white bg-[var(--accent)] text-[#221C16]"
                            : "border-[#8C8275] bg-white"
                        }`}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </span>
                      <span>{word.term}</span>
                      {word.meaningVi && (
                        <span
                          className={`text-[11px] font-normal truncate max-w-[120px] ${
                            isSelected ? "text-amber-200" : "text-[#6B6258]"
                          }`}
                        >
                          ({word.meaningVi})
                        </span>
                      )}
                      {isWeak && !isSelected && (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" title="Từ yếu" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Section 2: CEFR Level */}
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-black text-[#221C16]">
              2. Trình độ ngôn ngữ (CEFR)
            </legend>
            <div className="flex flex-wrap gap-2">
              {CEFR_OPTIONS.map((level) => {
                const isSelected = cefr === level;
                return (
                  <label
                    key={level}
                    className={`cursor-pointer rounded-xl border-2 px-3 py-1.5 text-xs font-black transition-all ${
                      isSelected
                        ? "border-[#221C16] bg-[#221C16] text-[#FFFDF9] shadow-[2px_2px_0px_#221C16]"
                        : "border-[#221C16] bg-[#FFFDF9] text-[#221C16] hover:bg-[#F5EEDB]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="lesson-cefr"
                      value={level}
                      checked={isSelected}
                      onChange={() => setCefr(level)}
                      className="sr-only"
                    />
                    <span>{level}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Section 3: Topic / Context */}
          <section className="space-y-2">
            <label className="text-sm font-black text-[#221C16]">
              3. Chủ đề / Ngữ cảnh bài học
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: Workplace, Travel, Science, Daily Routine..."
              className="w-full rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <div className="flex flex-wrap gap-1.5">
              {TOPIC_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTopic(preset)}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                    topic === preset
                      ? "border-[#221C16] bg-[#FEF3C7] text-[#92400E]"
                      : "border-[#D8CEBE] bg-[#FFFDF9] text-[#6B6258] hover:border-[#221C16]"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="shrink-0 flex items-center justify-between border-t-2 border-[#221C16] bg-[#FFFDF9] px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="brick-button-secondary px-4 py-2 text-xs font-bold"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSubmitting || selectedWordIds.length === 0}
            className="brick-button-primary px-5 py-2.5 text-xs font-black flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang tạo tác vụ...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Tạo bài học AI ({selectedWordIds.length} từ)</span>
              </>
            )}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
