import React from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { StoryPageContainer } from "@/components/story/StoryPageContainer";
import { deckService, storyService } from "@/services/vocabulary";

export const revalidate = 0;

interface StoryPageProps {
  params: Promise<{ id: string }>;
}

export default async function DeckStoryPage({ params }: StoryPageProps) {
  const { id } = await params;
  const deck = await deckService.getDeckById(id);

  if (!deck) {
    notFound();
  }

  const stories = await storyService.getStoriesByDeckId(id);

  // Map Story model to client StoryData format
  const mappedStories = stories.map((s) => ({
    id: s.id,
    deckId: s.deckId,
    title: s.title,
    content: s.content,
    cefr: s.cefr,
    length: s.length,
    topic: s.topic,
    targetWords: Array.isArray(s.targetWords)
      ? (s.targetWords as string[])
      : JSON.parse((s.targetWords as unknown as string) || "[]"),
    createdAt: s.createdAt,
  }));

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 sm:py-8">
        <StoryPageContainer
          deck={{
            id: deck.id,
            name: deck.name,
            cards: deck.cards.map((c) => ({ term: c.term })),
          }}
          initialStories={mappedStories}
        />
      </main>
      <footer className="w-full border-t-2 border-[#221C16] py-6 bg-[#FAF6EE] text-center text-xs text-[#6B6258] font-bold">
        <p>WordNest &bull; Turn words into stories</p>
      </footer>
    </div>
  );
}
