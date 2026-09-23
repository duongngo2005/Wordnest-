import React from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { DeckView } from "@/components/flashcards/DeckView";
import { deckService, practiceEvidenceService, serializePracticeEvidenceSummary } from "@/services/vocabulary";

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

  const { summaries, needPracticeCards } = await practiceEvidenceService.getDeckPracticeEvidence(id);
  const evidenceMap: Record<string, ReturnType<typeof serializePracticeEvidenceSummary>> = {};
  for (const [cardId, summary] of summaries.entries()) {
    evidenceMap[cardId] = serializePracticeEvidenceSummary(summary);
  }

  return (
    <div className="app-shell flex min-h-[100dvh] flex-col">
      <Header />
      <main className="page-container wn-page flex-1">
        <DeckView
          key={`${deck.id}:${deck.cards.length}`}
          initialDeck={deck}
          evidenceMap={evidenceMap}
          needPracticeCardIds={needPracticeCards.map((item) => item.card.id)}
        />
      </main>
    </div>
  );
}
