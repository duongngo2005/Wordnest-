"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Plus, Sparkles, Trash2 } from "lucide-react";
import { StoryGeneratorModal, type DeckStoryWord } from "./StoryGeneratorModal";
import { StoryReader, type StoryData } from "./StoryReader";
import { playUISound } from "@/lib/ui-sound";

interface StoryPageContainerProps {
  deck: { id: string; name: string };
  initialStories: StoryData[];
  deckWords: DeckStoryWord[];
}

export function StoryPageContainer({ deck, initialStories, deckWords }: StoryPageContainerProps) {
  const [stories, setStories] = useState(initialStories);
  const [activeStoryId, setActiveStoryId] = useState(initialStories[0]?.id ?? null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [storyPendingDelete, setStoryPendingDelete] = useState<StoryData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [isReadingMode, setIsReadingMode] = useState(false);
  const activeStory = stories.find((story) => story.id === activeStoryId) ?? stories[0] ?? null;

  useEffect(() => {
    if (isReadingMode) document.documentElement.dataset.storyReadingMode = "true";
    else delete document.documentElement.dataset.storyReadingMode;
    return () => {
      delete document.documentElement.dataset.storyReadingMode;
    };
  }, [isReadingMode]);

  const setReadingMode = (nextReadingMode: boolean) => {
    if (nextReadingMode !== isReadingMode) playUISound("paperFlip");
    setIsReadingMode(nextReadingMode);
  };

  const addStory = (story: StoryData) => {
    setStories((current) => [story, ...current.filter((item) => item.id !== story.id)]);
    setActiveStoryId(story.id);
    setStatus("");
  };

  const deleteStory = async () => {
    if (!storyPendingDelete) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/stories/${storyPendingDelete.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Không thể xóa truyện. Hãy thử lại.");
      }

      const deletedStory = storyPendingDelete;
      const remainingStories = stories.filter((story) => story.id !== deletedStory.id);
      setStories(remainingStories);
      setActiveStoryId((current) => current === deletedStory.id ? remainingStories[0]?.id ?? null : current);
      setStoryPendingDelete(null);
      setStatus(`Đã xóa “${deletedStory.title}”.`);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Không thể xóa truyện. Hãy thử lại.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`mx-auto space-y-5 ${isReadingMode ? "max-w-6xl" : "max-w-5xl"}`}>
      {!isReadingMode ? <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/decks/${deck.id}`} className="inline-flex w-fit items-center gap-1.5 rounded-xl border-2 border-[#221C16] bg-[#FFFDF9] px-3 py-1.5 text-xs font-black text-[#221C16] shadow-[2px_2px_0px_#221C16] transition-transform active:translate-y-0.5">
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          <span>Về bộ từ</span>
        </Link>
        <button type="button" onClick={() => setIsGeneratorOpen(true)} className="wn-button wn-button-primary text-sm"><Sparkles className="h-4 w-4" />Tạo truyện</button>
      </div> : null}

      <p
        aria-live="polite"
        aria-atomic="true"
        className={status ? "rounded-[var(--radius)] border border-[#0D9488] bg-[#F1FCFA] p-3 text-sm font-bold text-[#134E4A]" : "wn-sr-only"}
      >
        {status}
      </p>

      {!isReadingMode && stories.length > 1 ? (
        <nav aria-label="Chọn truyện đã lưu" className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
          {stories.map((story) => {
            const isActive = story.id === activeStory?.id;
            return (
              <button
                key={story.id}
                type="button"
                onClick={() => {
                  setActiveStoryId(story.id);
                  setStoryPendingDelete(null);
                  setDeleteError(null);
                }}
                aria-pressed={isActive}
                className={`wn-story-tab shrink-0 ${isActive ? "wn-story-tab--active" : ""}`}
              >
                <BookOpen className={`h-3.5 w-3.5 ${isActive ? "text-[#E06B43]" : "text-[#8C8275]"}`} />
                <span className="truncate max-w-[200px] sm:max-w-xs">{story.title}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {activeStory ? (
        <StoryReader
          key={`${activeStory.id}-${isGeneratorOpen ? "generator-open" : "generator-closed"}`}
          story={activeStory}
          deckWords={deckWords}
          onDelete={() => {
            setStoryPendingDelete(activeStory);
            setDeleteError(null);
          }}
          readingMode={isReadingMode}
          onReadingModeChange={setReadingMode}
          storyActionNotice={
            storyPendingDelete?.id === activeStory.id ? (
              <section
                id="story-delete-confirmation"
                className="mt-4 rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-4 animate-in fade-in"
                aria-labelledby="story-delete-title"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[#B91C1C] bg-white text-[#B91C1C]">
                    <Trash2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 id="story-delete-title" className="text-sm font-black text-[#991B1B]">
                      Xóa truyện này?
                    </h2>
                    <p className="mt-1 text-sm text-[#7F1D1D]">
                      “{storyPendingDelete.title}” sẽ bị xóa vĩnh viễn khỏi bộ từ.
                    </p>
                    {deleteError ? (
                      <p role="alert" className="mt-2 text-sm font-bold text-[#991B1B]">
                        {deleteError}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={deleteStory}
                        className="wn-button wn-button-danger text-xs font-black"
                        disabled={isDeleting}
                        aria-busy={isDeleting}
                      >
                        <Trash2 className="h-4 w-4" />
                        {isDeleting ? "Đang xóa…" : `Xóa “${storyPendingDelete.title}”`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStoryPendingDelete(null)}
                        className="wn-button wn-button-secondary text-xs font-bold"
                        disabled={isDeleting}
                      >
                        Hủy bỏ
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null
          }
        />
      ) : (
        <section className="surface-card p-7 text-center sm:p-10">
          <BookOpen className="mx-auto h-8 w-8 text-[#0D9488]" />
          <h1 className="mt-3 text-xl font-black text-[#221C16]">Chưa có truyện nào</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6258]">Chọn các từ trong deck để tạo một câu chuyện vừa sức; nghĩa của các từ mục tiêu sẽ luôn sẵn khi đọc.</p>
          <button type="button" onClick={() => setIsGeneratorOpen(true)} className="wn-button wn-button-primary mt-5"><Plus className="h-4 w-4" />Tạo truyện đầu tiên</button>
        </section>
      )}

      <StoryGeneratorModal open={isGeneratorOpen} deck={deck} words={deckWords} onClose={() => setIsGeneratorOpen(false)} onStoryCreated={addStory} />
    </div>
  );
}
