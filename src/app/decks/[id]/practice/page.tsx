import React from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { FlashcardPracticeRunner } from "@/components/practice/FlashcardPracticeRunner";
import type { PracticeFlashcardData } from "@/components/practice/flashcard-practice-session";
import { deckService } from "@/services/vocabulary";

export const revalidate = 0;

interface PracticePageProps {
  params: Promise<{ id: string }>;
}

function toPracticeFlashcardData(card: {
  id: string;
  term: string;
  meaningVi: string;
  definitionEn: string | null;
  ipa: string | null;
  partOfSpeech: string | null;
  cefr: string | null;
  exampleEn: string | null;
  exampleVi: string | null;
  imageUrl: string | null;
  imageAuthor: string | null;
  imageSource: string | null;
}): PracticeFlashcardData {
  return {
    id: card.id,
    term: card.term,
    meaningVi: card.meaningVi,
    definitionEn: card.definitionEn,
    ipa: card.ipa,
    partOfSpeech: card.partOfSpeech,
    cefr: card.cefr,
    exampleEn: card.exampleEn,
    exampleVi: card.exampleVi,
    imageUrl: card.imageUrl,
    imageAuthor: card.imageAuthor,
    imageSource: card.imageSource,
  };
}

export default async function PracticePage({ params }: PracticePageProps) {
  const { id } = await params;
  const deck = await deckService.getDeckById(id);
  if (!deck) notFound();

  return (
    <div className="app-shell flex min-h-[100dvh] flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="page-container wn-page flex-1">
        <FlashcardPracticeRunner
          deckId={deck.id}
          deckName={deck.name}
          initialCards={deck.cards.map(toPracticeFlashcardData)}
        />
      </main>
    </div>
  );
}
