"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  Mic,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PronounceButton } from "@/components/flashcards/PronounceButton";
import { normalizeStoryPlainText } from "@/lib/story/story-content";
import { normalizeStoryVocabulary } from "@/lib/story/story-vocabulary";
import { extractSentenceContainingUsageWithBoundary } from "@/lib/story/story-context";

export type LessonData = {
  id: string;
  deckId: string;
  title: string;
  content: string;
  cefr: string;
  targetWords: unknown;
  createdAt: Date | string;
};

export type LessonReaderProps = {
  lesson: LessonData;
  deck: { id: string; name: string };
  onStartShadowing?: () => void;
  onDelete?: () => void;
};

export function LessonReader({
  lesson,
  deck,
  onStartShadowing,
  onDelete,
}: LessonReaderProps) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const title = useMemo(() => normalizeStoryPlainText(lesson.title), [lesson.title]);
  const content = useMemo(() => normalizeStoryPlainText(lesson.content), [lesson.content]);
  const paragraphs = useMemo(() => content.split(/\n\n+/).filter(Boolean), [content]);

  const vocabulary = useMemo(
    () => normalizeStoryVocabulary(lesson.targetWords),
    [lesson.targetWords]
  );

  const usages = useMemo(() => vocabulary.usage || [], [vocabulary]);

  const sortedUsages = useMemo(() => {
    return [...usages]
      .filter((u) => u.usedAs.trim().length > 0)
      .sort((a, b) => b.usedAs.length - a.usedAs.length);
  }, [usages]);

  const usageBySurface = useMemo(() => {
    const map = new Map<string, (typeof usages)[number]>();
    for (const u of sortedUsages) {
      const key = u.usedAs.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, u);
      }
    }
    return map;
  }, [sortedUsages]);

  const highlightRegex = useMemo(() => {
    if (sortedUsages.length === 0) return null;
    const pattern = sortedUsages
      .map((u) => u.usedAs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    return new RegExp(`(\\b(?:${pattern})\\b)`, "gi");
  }, [sortedUsages]);

  const translationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of vocabulary.contextualTranslations || []) {
      map.set(t.term.toLowerCase(), t.meaningVi);
      map.set(t.usedAs.toLowerCase(), t.meaningVi);
    }
    return map;
  }, [vocabulary]);

  // Highlights target words within a paragraph
  const renderParagraph = (text: string, pIdx: number) => {
    if (!highlightRegex || sortedUsages.length === 0) return <span>{text}</span>;

    const parts = text.split(highlightRegex);

    return parts.map((part, idx) => {
      const matchUsage = usageBySurface.get(part.trim().toLowerCase());

      if (matchUsage) {
        const meaning =
          translationMap.get(matchUsage.term.toLowerCase()) ||
          translationMap.get(matchUsage.usedAs.toLowerCase());
        const isSelected = selectedWord === matchUsage.term.toLowerCase();

        return (
          <button
            key={`p-${pIdx}-${idx}`}
            type="button"
            onClick={() => setSelectedWord(isSelected ? null : matchUsage.term.toLowerCase())}
            title={meaning ? `${matchUsage.term}: ${meaning}` : matchUsage.term}
            className={`inline-block rounded px-1 py-0.5 font-bold transition-colors cursor-pointer ${
              isSelected
                ? "bg-[#221C16] text-[#FFFDF9]"
                : "bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]"
            }`}
          >
            {part}
          </button>
        );
      }

      return <span key={`p-${pIdx}-${idx}`}>{part}</span>;
    });
  };

  return (
    <article className="wn-story-paper relative max-w-4xl mx-auto space-y-6" aria-labelledby="lesson-title">
      {/* Header */}
      <header className="wn-story-reader-header pb-4 border-b-2 border-dashed border-[#CFC2AF]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="wn-story-masthead flex items-center gap-2">
            <span>WordNest · AI Lesson</span>
            <span aria-hidden="true">✦</span>
            <span>CEFR {lesson.cefr}</span>
            <span aria-hidden="true">✦</span>
            <span>{usages.length} từ mục tiêu</span>
          </div>

          <div className="flex items-center gap-2">
            {onStartShadowing && (
              <button
                type="button"
                onClick={onStartShadowing}
                className="brick-button-secondary px-3.5 py-1.5 text-xs font-black flex items-center gap-1.5 shadow-[2px_2px_0px_#221C16]"
                title="Luyện Shadowing bài học này"
              >
                <Mic className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Luyện Shadowing</span>
              </button>
            )}

            <Link
              href={`/decks/${deck.id}/quiz?mode=lesson_practice&lessonId=${lesson.id}`}
              className="brick-button-primary px-3.5 py-1.5 text-xs font-black flex items-center gap-1.5 shadow-[2px_2px_0px_#221C16]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Luyện tập bài này</span>
            </Link>

            {onDelete && (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="wn-story-icon-control text-rose-700 hover:text-rose-900"
                aria-label="Xóa bài học"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <h1 id="lesson-title" className="wn-story-title text-[#221C16]">
            {title}
          </h1>
          <PronounceButton text={title} size="sm" />
        </div>
      </header>

      {/* Confirmation Dialog for Delete */}
      {isConfirmingDelete && (
        <div className="rounded-xl border-2 border-rose-600 bg-rose-50 p-4 space-y-2">
          <p className="text-sm font-black text-rose-900">
            Bạn có chắc chắn muốn xóa bài học này?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setIsConfirmingDelete(false);
                onDelete?.();
              }}
              className="brick-button-primary bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-bold"
            >
              Xác nhận xóa
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="brick-button-secondary px-3 py-1.5 text-xs font-bold"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Lesson Passage Prose */}
      <div className="wn-story-prose space-y-4 text-base leading-relaxed text-[#221C16] select-text">
        {paragraphs.map((p, idx) => (
          <p key={idx} className="indent-4 sm:indent-6">
            {renderParagraph(p, idx)}
          </p>
        ))}
      </div>

      <div className="wn-story-endmark" aria-hidden="true">
        <span />
        <b>✦</b>
        <span />
      </div>

      {/* Vocabulary In Context List */}
      {usages.length > 0 && (
        <section className="space-y-3 pt-4 border-t border-dashed border-[#CFC2AF]">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="text-base font-black text-[#221C16]">
              Từ vựng trong bài học ({usages.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {usages.map((usage, idx) => {
              const meaning =
                translationMap.get(usage.term.toLowerCase()) ||
                translationMap.get(usage.usedAs.toLowerCase()) ||
                usage.term;
              const sentence = extractSentenceContainingUsageWithBoundary(content, usage.usedAs);
              const isSelected = selectedWord === usage.term.toLowerCase();

              return (
                <div
                  key={`${usage.term}-${idx}`}
                  onClick={() => setSelectedWord(isSelected ? null : usage.term.toLowerCase())}
                  className={`rounded-xl border-2 p-3 transition-all cursor-pointer ${
                    isSelected
                      ? "border-[#221C16] bg-[#FEF8ED] shadow-[2px_2px_0px_#221C16]"
                      : "border-[#E5E0D5] bg-[#FFFDF9] hover:border-[#221C16]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-sm text-[#221C16]">{usage.term}</span>
                        {usage.term.toLowerCase() !== usage.usedAs.toLowerCase() && (
                          <span className="text-[11px] font-semibold text-[#8C8275]">
                            (dạng: <i>{usage.usedAs}</i>)
                          </span>
                        )}
                        <PronounceButton text={usage.usedAs} size="sm" />
                      </div>
                      <p className="text-xs font-bold text-[#8A5817] mt-0.5">{meaning}</p>
                    </div>
                  </div>

                  {sentence && (
                    <blockquote className="mt-2 text-xs text-[#524B43] italic border-l-2 border-[var(--accent)] pl-2">
                      &ldquo;{sentence}&rdquo;
                    </blockquote>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Practice CTA Banner */}
      <section className="mt-8 pt-6 border-t-2 border-dashed border-[#CFC2AF] flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-[#FFFDF9] rounded-2xl border-2 border-[#221C16] shadow-[3px_3px_0px_#221C16]">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-base sm:text-lg font-black text-[#221C16] flex items-center justify-center sm:justify-start gap-2">
            <Sparkles className="w-5 h-5 text-[var(--accent)]" />
            <span>Đã đọc xong bài học?</span>
          </h3>
          <p className="text-xs sm:text-sm font-medium text-[#6B6258]">
            Củng cố ngay với bài tập Đọc hiểu, Từ vựng ngữ cảnh và Cloze.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          {onStartShadowing && (
            <button
              type="button"
              onClick={onStartShadowing}
              className="brick-button-secondary shrink-0 px-4 py-3 text-xs sm:text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16] flex items-center"
            >
              <Mic className="w-4 h-4 text-[var(--accent)]" />
              <span>Luyện Shadowing</span>
            </button>
          )}
          <Link
            href={`/decks/${deck.id}/quiz?mode=lesson_practice&lessonId=${lesson.id}`}
            className="brick-button-primary shrink-0 px-5 py-3 text-xs sm:text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16]"
          >
            <span>Luyện tập ngay</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </article>
  );
}
