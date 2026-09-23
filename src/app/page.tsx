import React from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, Sparkles } from "lucide-react";
import { Header } from "@/components/ui/Header";
import { FolderLibrary } from "@/components/folders/FolderLibrary";
import { folderService } from "@/services/vocabulary";

export const revalidate = 0;

export default async function HomePage() {
  const library = await folderService.getLibrary();
  const decks = [...library.uncategorizedDecks, ...library.folders.flatMap((folder) => folder.decks)];
  const dueCount = decks.reduce((count, deck) => count + deck.dueTodayCount, 0);
  const firstDueDeck = decks.find((deck) => deck.dueTodayCount > 0);

  return (
    <div className="app-shell">
      <Header />
      <main className="page-container wn-page wn-stack">
        {/* Today ticket: the only deliberately high-contrast surface on Home. */}
        <section
          className="wn-primary-surface grid overflow-hidden bg-[#FFFDF9] sm:grid-cols-[minmax(0,1fr)_auto]"
          aria-labelledby="today-heading"
        >
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-black text-[#6B6258]">
              {dueCount > 0 ? (
                <Sparkles className="h-5 w-5 text-[#E06B43]" strokeWidth={2.5} />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-[#15803D]" strokeWidth={2.5} />
              )}
              Hôm nay
            </div>
            <div className="min-w-0">
              <h2 id="today-heading" className="mt-4 text-4xl font-black tracking-tight text-[#221C16] sm:text-5xl">
                {dueCount}
              </h2>
              <p className="mt-1 text-sm font-bold text-[#6B6258]">{dueCount > 0 ? "thẻ cần ôn" : "đã ôn xong"}</p>
            </div>
          </div>
          <div className="flex items-end justify-between gap-4 border-t-2 border-[#221C16] bg-[#FEF3C7] p-4 sm:min-w-52 sm:flex-col sm:items-stretch sm:justify-center sm:border-l-2 sm:border-t-0 sm:p-5">
            {firstDueDeck ? (
              <Link
                href={`/decks/${firstDueDeck.id}/study`}
                className="brick-button-primary px-5 py-3 text-sm font-black"
              >
                <BookOpen className="h-4 w-4" strokeWidth={2.5} />
                <span>Ôn tập</span>
              </Link>
            ) : null}
          </div>
        </section>

        {/* Library Content */}
        <FolderLibrary {...library} />
      </main>
    </div>
  );
}
