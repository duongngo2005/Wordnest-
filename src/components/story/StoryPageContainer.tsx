"use client";

import React, { useState } from "react";
import Link from "next/link";
import { StoryReader, StoryData } from "./StoryReader";
import { StoryGeneratorModal } from "./StoryGeneratorModal";
import { WordNestMascot } from "../ui/Mascot";
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Trash2,
} from "lucide-react";

interface StoryPageContainerProps {
  deck: {
    id: string;
    name: string;
    cards: { term: string }[];
  };
  initialStories: StoryData[];
}

export function StoryPageContainer({
  deck,
  initialStories,
}: StoryPageContainerProps) {
  const [stories, setStories] = useState<StoryData[]>(initialStories);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(
    initialStories[0]?.id || null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const availableWords = deck.cards.map((c) => c.term);
  const activeStory = stories.find((s) => s.id === activeStoryId) || stories[0] || null;

  const handleStoryGenerated = async (newStoryId: string) => {
    try {
      const res = await fetch(`/api/stories?deckId=${deck.id}`);
      const data = await res.json();
      if (data.success && data.stories) {
        setStories(data.stories);
        setActiveStoryId(newStoryId);
      }
    } catch (err) {
      console.error("Failed to refresh stories:", err);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    if (!confirm("Bạn có chắc muốn xóa câu chuyện này không?")) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/stories/${storyId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete story");

      const remaining = stories.filter((s) => s.id !== storyId);
      setStories(remaining);
      setActiveStoryId(remaining[0]?.id || null);
    } catch (err) {
      console.error("Failed to delete story:", err);
      alert("Không thể xóa câu chuyện. Vui lòng thử lại.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Top Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link
          href={`/decks/${deck.id}`}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#6B6258] hover:text-[#221C16] p-1 rounded-md"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về bộ từ vựng: {deck.name}</span>
        </Link>

        <button
          onClick={() => setIsModalOpen(true)}
          className="brick-button-primary px-4 py-2 text-xs sm:text-sm font-black gap-2 shadow-[3px_3px_0px_#221C16]"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo truyện mới</span>
        </button>
      </div>

      {/* Stories Switcher Tabs (if more than 1 story) */}
      {stories.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <span className="text-xs font-black uppercase text-[#6B6258] shrink-0">
            Các câu chuyện ({stories.length}):
          </span>
          {stories.map((story) => {
            const isActive = story.id === activeStoryId;
            return (
              <button
                key={story.id}
                onClick={() => setActiveStoryId(story.id)}
                className={`px-3 py-1.5 rounded-xl border-2 text-xs font-black shrink-0 transition-all ${
                  isActive
                    ? "bg-[#221C16] text-white border-[#221C16] shadow-[2px_2px_0px_#E06B43]"
                    : "bg-[#FFFDF9] text-[#221C16] border-[#221C16] hover:bg-[#FEF3C7]"
                }`}
              >
                {story.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      {activeStory ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => handleDeleteStory(activeStory.id)}
              disabled={isDeleting}
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 p-1 rounded-md"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa truyện này</span>
            </button>
          </div>

          <StoryReader
            key={activeStory.id}
            story={activeStory}
            onCardAdded={() => {
              // Notification / feedback handled in popup
            }}
          />
        </div>
      ) : (
        /* Empty State */
        <div className="brick-card p-8 sm:p-12 bg-[#FFFDF9] text-center space-y-5 shadow-[6px_6px_0px_#221C16]">
          <div className="flex justify-center">
            <WordNestMascot mood="reading" size={110} />
          </div>

          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-xl sm:text-2xl font-black text-[#221C16]">
              Chưa có câu chuyện nào cho bộ thẻ này!
            </h2>
            <p className="text-xs sm:text-sm text-[#6B6258] font-medium leading-relaxed">
              Hãy dùng AI để ghép các từ vựng trong &ldquo;{deck.name}&rdquo; thành một câu chuyện ngắn thú vị, giúp bạn ghi nhớ nghĩa từ trong ngữ cảnh tự nhiên.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="brick-button-primary px-6 py-3 text-sm font-black gap-2"
          >
            <Sparkles className="w-5 h-5" />
            <span>Tạo câu chuyện đầu tiên ngay</span>
          </button>
        </div>
      )}

      {/* Generator Modal */}
      <StoryGeneratorModal
        deckId={deck.id}
        availableWords={availableWords}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStoryGenerated={handleStoryGenerated}
      />
    </div>
  );
}
