import React from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { StudyMode } from "@/components/study/StudyMode";
import { deckService } from "@/services/vocabulary";

export const revalidate = 0;

interface PracticePageProps {
  params: Promise<{ id: string }>;
}

export default async function PracticePage({ params }: PracticePageProps) {
  const { id } = await params;
  const deck = await deckService.getDeckById(id);
  if (!deck) notFound();

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 sm:py-6">
        <StudyMode
          deckId={deck.id}
          deckName={deck.name}
          initialCards={deck.cards}
          mode="free-practice"
        />
      </main>
    </div>
  );
}
