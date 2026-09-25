import React from "react";
import { db } from "@/lib/db";
import { Header } from "@/components/ui/Header";
import { TodayPostcard } from "@/components/home/TodayPostcard";
import { FolderLibrary } from "@/components/folders/FolderLibrary";
import { folderService } from "@/services/vocabulary";

export const revalidate = 0;

function getTodayRange(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export default async function HomePage() {
  const now = new Date();
  const { start: todayStart, end: tomorrowStart } = getTodayRange(now);
  const [library, dueCards, reviewedTodayLogs] = await Promise.all([
    folderService.getLibrary(),
    db.flashcard.findMany({
      where: {
        state: { gt: 0 },
        due: { lte: now },
      },
      orderBy: [{ due: "asc" }, { reps: "desc" }],
      select: { deckId: true },
    }),
    db.reviewLog.findMany({
      where: {
        review: { gte: todayStart, lt: tomorrowStart },
      },
      select: { cardId: true },
    }),
  ]);

  const decks = [...library.uncategorizedDecks, ...library.folders.flatMap((folder) => folder.decks)];
  const dueCount = dueCards.length;
  const firstDueDeck = dueCards[0] ? decks.find((deck) => deck.id === dueCards[0].deckId) : undefined;
  const reviewedTodayCount = new Set(reviewedTodayLogs.map((log) => log.cardId)).size;
  const studyDeckId = firstDueDeck?.id || dueCards[0]?.deckId || (decks.length > 0 ? decks[0].id : undefined);

  return (
    <div className="app-shell">
      <Header />
      <main className="page-container wn-page wn-stack">
        <TodayPostcard
          dueCount={dueCount}
          reviewedTodayCount={reviewedTodayCount}
          studyDeckId={studyDeckId}
          date={now}
        />

        {/* Library Content */}
        <FolderLibrary {...library} />
      </main>
    </div>
  );
}
