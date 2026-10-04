"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Sparkles } from "lucide-react";
import { LessonReader, type LessonData } from "./LessonReader";
import { LessonGeneratorModal, type LessonDeckWord } from "./LessonGeneratorModal";
import { ShadowingPlayer } from "@/components/shadowing/ShadowingPlayer";
import { toast } from "sonner";

export type LessonPageContainerProps = {
  deck: { id: string; name: string };
  initialLessons: LessonData[];
  deckWords: LessonDeckWord[];
  initialLessonId?: string;
  initialOpenGenerator?: boolean;
  weakWordIds?: string[];
};

export function LessonPageContainer({
  deck,
  initialLessons,
  deckWords,
  initialLessonId,
  initialOpenGenerator = false,
  weakWordIds = [],
}: LessonPageContainerProps) {
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonData[]>(initialLessons);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(
    initialLessonId && initialLessons.some((l) => l.id === initialLessonId)
      ? initialLessonId
      : initialLessons[0]?.id ?? null
  );
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(initialOpenGenerator);
  const [isShadowing, setIsShadowing] = useState(false);

  const activeLesson = lessons.find((l) => l.id === activeLessonId) || lessons[0] || null;

  const handleDeleteLesson = async (lessonId: string) => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Không thể xóa bài học.");
      }

      toast.success("Đã xóa bài học");
      const remaining = lessons.filter((l) => l.id !== lessonId);
      setLessons(remaining);
      setActiveLessonId(remaining[0]?.id ?? null);
      setIsShadowing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đã xảy ra lỗi khi xóa bài học.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Top Navigation & Action Bar */}
      {!isShadowing && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/decks/${deck.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] transition-transform active:translate-y-0.5"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
            <span>Về bộ từ: {deck.name}</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsGeneratorOpen(true)}
            className="brick-button-primary px-4 py-2 text-xs sm:text-sm font-black flex items-center gap-2 shadow-[2px_2px_0px_#221C16]"
          >
            <Sparkles className="h-4 w-4" />
            <span>Tạo bài học AI mới</span>
          </button>
        </div>
      )}

      {/* Lesson Selector Tabs (if more than 1 lesson and not shadowing) */}
      {!isShadowing && lessons.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#E5E0D5]">
          {lessons.map((l) => {
            const isActive = l.id === activeLesson?.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setActiveLessonId(l.id);
                  setIsShadowing(false);
                }}
                className={`shrink-0 rounded-xl border-2 px-3 py-1.5 text-xs font-black transition-all ${
                  isActive
                    ? "border-[#221C16] bg-[#221C16] text-[#FFFDF9] shadow-[2px_2px_0px_#221C16]"
                    : "border-[#E5E0D5] bg-[#FFFDF9] text-[#221C16] hover:border-[#221C16]"
                }`}
              >
                <span className="truncate max-w-[200px] inline-block">{l.title}</span>
                <span className="ml-1.5 text-[10px] opacity-75">({l.cefr})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      {isShadowing && activeLesson ? (
        <ShadowingPlayer
          source={{
            id: activeLesson.id,
            deckId: deck.id,
            title: activeLesson.title,
            content: activeLesson.content,
            type: "lesson",
            cefr: activeLesson.cefr,
          }}
          onExit={() => setIsShadowing(false)}
        />
      ) : activeLesson ? (
        <LessonReader
          lesson={activeLesson}
          deck={deck}
          onStartShadowing={() => setIsShadowing(true)}
          onDelete={() => handleDeleteLesson(activeLesson.id)}
        />
      ) : (
        <div className="rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-8 sm:p-12 text-center space-y-4 shadow-[4px_4px_0px_#221C16]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#221C16] bg-[#FEF3C7] shadow-[2px_2px_0px_#221C16]">
            <BookOpen className="h-7 w-7 text-[#D97706]" strokeWidth={2.5} />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-[#221C16]">Chưa có bài học AI nào</h2>
            <p className="text-xs sm:text-sm font-semibold text-[#6B6258] max-w-md mx-auto">
              Hãy chọn các từ vựng trong bộ thẻ để AI tạo một đoạn văn học tập ngắn, tự nhiên kèm bài tập đọc hiểu và từ vựng!
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsGeneratorOpen(true)}
            className="brick-button-primary px-5 py-2.5 text-sm font-black inline-flex items-center gap-2 shadow-[2px_2px_0px_#221C16]"
          >
            <Sparkles className="h-4 w-4" />
            <span>Tạo bài học AI ngay</span>
          </button>
        </div>
      )}

      {/* Modal */}
      <LessonGeneratorModal
        open={isGeneratorOpen}
        deck={deck}
        words={deckWords}
        weakWordIds={weakWordIds}
        onClose={() => setIsGeneratorOpen(false)}
        onLessonCreated={() => {
          setIsGeneratorOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
