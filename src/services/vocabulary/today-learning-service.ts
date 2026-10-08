import { db } from "@/lib/db";
import type { TodayDeckState } from "@/lib/today-learning-plan";
import { practiceEvidenceService } from "./practice-evidence-service";

type DeckCountRow = {
  deckId: string;
  _count: { _all: number };
};

function toCountMap(rows: DeckCountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.deckId, row._count._all]));
}

/**
 * Compact, read-only Home projection. It intentionally loads no card lexical
 * fields, ReviewLog history, QuizAttempt history, or progress analytics.
 */
export class TodayLearningService {
  async getTodayDeckStates(now: Date = new Date()): Promise<TodayDeckState[]> {
    // This exactly preserves Home's established order: standalone decks by
    // recent update first, followed by folders and their position-ordered decks.
    const [folders, uncategorizedDecks] = await Promise.all([
      db.folder.findMany({
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          decks: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { id: true, name: true },
          },
        },
      }),
      db.deck.findMany({
        where: { folderId: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true },
      }),
    ]);
    const orderedDecks = [...uncategorizedDecks, ...folders.flatMap((folder) => folder.decks)];
    if (orderedDecks.length === 0) return [];

    const deckIds = orderedDecks.map((deck) => deck.id);
    const [totalRows, dueRows, newRows, weakCountByDeckId] = await Promise.all([
      db.flashcard.groupBy({
        by: ["deckId"],
        where: { deckId: { in: deckIds } },
        _count: { _all: true },
      }),
      db.flashcard.groupBy({
        by: ["deckId"],
        where: {
          deckId: { in: deckIds },
          state: { gt: 0 },
          due: { lte: now },
        },
        _count: { _all: true },
      }),
      db.flashcard.groupBy({
        by: ["deckId"],
        where: { deckId: { in: deckIds }, state: 0 },
        _count: { _all: true },
      }),
      practiceEvidenceService.getDeckWeakCardCounts(deckIds),
    ]);
    const totalCountByDeckId = toCountMap(totalRows);
    const dueCountByDeckId = toCountMap(dueRows);
    const newCountByDeckId = toCountMap(newRows);

    return orderedDecks.map((deck, stableOrder) => ({
      deckId: deck.id,
      deckName: deck.name,
      stableOrder,
      totalCards: totalCountByDeckId.get(deck.id) ?? 0,
      dueCount: dueCountByDeckId.get(deck.id) ?? 0,
      weakCount: weakCountByDeckId.get(deck.id) ?? 0,
      newCount: newCountByDeckId.get(deck.id) ?? 0,
    }));
  }
}

export const todayLearningService = new TodayLearningService();
