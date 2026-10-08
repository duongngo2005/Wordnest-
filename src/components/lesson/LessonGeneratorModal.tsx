"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { StoryCefr } from "@/lib/validation/story";
import { useAiTasks } from "@/components/ai/AiTaskProvider";
import {
  ContextualTargetPicker,
  type ContextualTargetWord,
} from "@/components/contextual/ContextualTargetPicker";
import {
  LESSON_CONTEXTUAL_TARGET_LIMIT,
  resolveContextualTargetSelection,
  toggleContextualTargetId,
  type ContextualTargetIntent,
  type ContextualTargetSelectionResult,
} from "@/lib/contextual-target-selection";
import { toast } from "sonner";
import { playUISound } from "@/lib/ui-sound";

export type LessonDeckWord = ContextualTargetWord & {
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

function selectionNormalizationNotice(selection: ContextualTargetSelectionResult): string | null {
  const notices: string[] = [];
  if (selection.ignoredUnknownIds.length > 0) {
    notices.push(`Đã bỏ qua ${selection.ignoredUnknownIds.length} từ không còn thuộc bộ thẻ.`);
  }
  if (selection.duplicateCount > 0) {
    notices.push(`Đã bỏ qua ${selection.duplicateCount} lựa chọn bị lặp.`);
  }
  if (selection.overflowCount > 0) {
    notices.push(`Chỉ giữ ${selection.selectedIds.length} từ phù hợp với giới hạn bài học.`);
  }
  return notices.length > 0 ? notices.join(" ") : null;
}

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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const { refreshJobs } = useAiTasks();
  const deckCardIds = useMemo(() => words.map((word) => word.id), [words]);
  const [initialSelection] = useState(() => {
    const intent: ContextualTargetIntent = initialSelectedIds.length > 0 ? "manual" : "general";
    return {
      intent,
      selection: resolveContextualTargetSelection({
        intent,
        deckCardIds: words.map((word) => word.id),
        weakCardIds: weakWordIds,
        manualIds: initialSelectedIds,
        maxSelectedIds: LESSON_CONTEXTUAL_TARGET_LIMIT,
      }),
    };
  });
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>(initialSelection.selection.selectedIds);
  const [targetIntent, setTargetIntent] = useState<ContextualTargetIntent>(initialSelection.intent);
  const [overflowCount, setOverflowCount] = useState(initialSelection.selection.overflowCount);
  const [normalizationNotice, setNormalizationNotice] = useState(
    selectionNormalizationNotice(initialSelection.selection)
  );
  const [cefr, setCefr] = useState<StoryCefr>("B1");
  const [topic, setTopic] = useState("Everyday Communication & Life");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog open/close lifecycle
  useEffect(() => {
    const dialog = dialogRef.current;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      if (dialog?.open) dialog.close();
      openerRef.current?.focus();
    };
  }, []);

  const applySelection = (
    intent: ContextualTargetIntent,
    selection: ContextualTargetSelectionResult,
    notice: string | null = null
  ) => {
    setSelectedWordIds(selection.selectedIds);
    setTargetIntent(intent);
    setOverflowCount(selection.overflowCount);
    setNormalizationNotice(notice);
    setError(null);
  };

  const applyTargetIntent = (intent: ContextualTargetIntent) => {
    playUISound("softTap");
    const selection = resolveContextualTargetSelection({
      intent,
      deckCardIds,
      weakCardIds: weakWordIds,
      manualIds: selectedWordIds,
      maxSelectedIds: LESSON_CONTEXTUAL_TARGET_LIMIT,
    });
    applySelection(intent, selection);
  };

  const toggleWord = (id: string) => {
    playUISound("softTap");
    const selection = toggleContextualTargetId({
      selectedIds: selectedWordIds,
      targetId: id,
      deckCardIds,
      maxSelectedIds: LESSON_CONTEXTUAL_TARGET_LIMIT,
    });
    if (selection.limitReached) {
      toast.warning("Mỗi bài học hỗ trợ tối đa 20 từ vựng.");
      return;
    }
    applySelection("manual", selection);
  };

  const selectAll = () => {
    playUISound("softTap");
    const selection = resolveContextualTargetSelection({
      intent: "manual",
      deckCardIds,
      manualIds: deckCardIds,
      maxSelectedIds: LESSON_CONTEXTUAL_TARGET_LIMIT,
    });
    applySelection("manual", selection);
  };

  const deselectAll = () => {
    playUISound("softTap");
    applySelection("manual", {
      selectedIds: [],
      ignoredUnknownIds: [],
      duplicateCount: 0,
      overflowCount: 0,
    });
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
            ref={closeButtonRef}
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
          <ContextualTargetPicker
            idPrefix="lesson"
            words={words}
            weakWordIds={weakWordIds}
            selectedIds={selectedWordIds}
            intent={targetIntent}
            maxSelectedIds={LESSON_CONTEXTUAL_TARGET_LIMIT}
            overflowCount={overflowCount}
            normalizationNotice={normalizationNotice}
            disabled={isSubmitting}
            onIntentChange={applyTargetIntent}
            onToggleWord={toggleWord}
            onSelectAll={selectAll}
            onClear={deselectAll}
          />

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
