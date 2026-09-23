"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { StoryReader, type StoryData } from "./StoryReader";

interface StoryPageContainerProps {
  deck: { id: string; name: string };
  initialStories: StoryData[];
}

export function StoryPageContainer({ deck, initialStories }: StoryPageContainerProps) {
  const [activeStoryId, setActiveStoryId] = useState(initialStories[0]?.id ?? null);
  const activeStory = initialStories.find((story) => story.id === activeStoryId) ?? initialStories[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/decks/${deck.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B6258] hover:text-[#221C16]"><ArrowLeft className="h-4 w-4" /> Về bộ từ</Link>
        <span className="rounded-full bg-[#F3F0EA] px-3 py-1.5 text-xs font-bold text-[#6B6258]">Kho truyện đã lưu</span>
      </div>

      {initialStories.length > 1 ? (
        <nav aria-label="Chọn truyện đã lưu" className="flex gap-2 overflow-x-auto pb-1">
          {initialStories.map((story) => <button key={story.id} type="button" onClick={() => setActiveStoryId(story.id)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold ${story.id === activeStory?.id ? "bg-[#221C16] text-white" : "bg-[#FFFDF9] text-[#4A4036] ring-1 ring-[#221C16]/14"}`}>{story.title}</button>)}
        </nav>
      ) : null}

      {activeStory ? <StoryReader story={activeStory} /> : (
        <section className="surface-card p-7 text-center sm:p-10">
          <BookOpen className="mx-auto h-8 w-8 text-[#A64B2B]" />
          <h1 className="mt-3 text-xl font-black text-[#221C16]">Chưa có truyện đã lưu</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6258]">Tạo truyện mới đang được tạm dừng để WordNest tập trung vào học từ vựng hằng ngày.</p>
        </section>
      )}
    </div>
  );
}
