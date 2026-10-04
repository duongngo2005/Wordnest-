import React, { cache } from "react";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { MistakeBankView } from "@/components/mistakes/MistakeBankView";
import { deckService, practiceEvidenceService } from "@/services/vocabulary";

export const revalidate = 0;

interface MistakesPageProps {
  params: Promise<{ id: string }>;
}

const getDeckOverview = cache((deckId: string) => deckService.getDeckOverview(deckId));

export async function generateMetadata({ params }: MistakesPageProps) {
  const { id } = await params;
  const deck = await getDeckOverview(id);
  if (!deck) return { title: "Sổ tay câu sai | WordNest" };
  return {
    title: `Sổ tay câu sai: ${deck.name} | WordNest`,
    description: `Xem lại các lỗi đã mắc và tiến độ khắc phục trong bộ từ "${deck.name}"`,
  };
}

export default async function MistakesPage({ params }: MistakesPageProps) {
  const { id } = await params;
  const deck = await getDeckOverview(id);

  if (!deck) {
    notFound();
  }

  const rawMistakesResult = await practiceEvidenceService.getDeckMistakes(id, {
    page: 1,
    pageSize: 10,
    filter: "ALL",
  });

  const initialData = {
    ...rawMistakesResult,
    mistakes: rawMistakesResult.mistakes.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  return (
    <div className="min-h-[100dvh] bg-[#FAF6EE] flex flex-col selection:bg-[#FDE68A] selection:text-[#221C16]">
      <Header />
      <main className="flex-1 w-full">
        <MistakeBankView
          deck={{
            id: deck.id,
            name: deck.name,
          }}
          initialData={initialData}
        />
      </main>
    </div>
  );
}
