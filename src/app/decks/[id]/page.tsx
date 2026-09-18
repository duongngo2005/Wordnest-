import React from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { DeckView } from "@/components/flashcards/DeckView";
import { deckService } from "@/services/vocabulary";

export const revalidate = 0;

interface DeckPageProps {
  params: Promise<{ id: string }>;
}

export default async function DeckPage({ params }: DeckPageProps) {
  const { id } = await params;
  const deck = await deckService.getDeckById(id);

  if (!deck) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8">
        <DeckView initialDeck={deck} />
      </main>
      <footer className="w-full border-t-2 border-[#221C16] py-6 bg-[#FAF6EE] text-center text-xs text-[#6B6258] font-bold">
        <p>WordNest &bull; Turn words into stories</p>
      </footer>
    </div>
  );
}
