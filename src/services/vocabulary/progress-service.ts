import { db } from "@/lib/db";
import { FlashcardStatus } from "@prisma/client";
import { fsrsService, SpacedRepetitionStats } from "@/services/fsrs";

export interface GlobalProgressStats {
  totalCards: number;
  newCount: number;
  learningCount: number;
  knownCount: number;
  masteryRate: number;
  totalDecks: number;
  totalQuizAttempts: number;
  overallAccuracy: number;
}

export interface DeckProgressItem {
  id: string;
  name: string;
  description: string | null;
  totalCards: number;
  newCount: number;
  learningCount: number;
  knownCount: number;
  dueTodayCount: number;
  masteryRate: number;
  quizAttemptsCount: number;
  lastQuizAccuracy: number | null;
  lastQuizAt: Date | null;
  updatedAt: Date;
}

export interface ProgressSummary {
  stats: GlobalProgressStats;
  spacedRepetition: SpacedRepetitionStats;
  decks: DeckProgressItem[];
}

export class ProgressService {
  /**
   * Computes comprehensive learning progress, FSRS spaced repetition,
   * and quiz statistics across all decks.
   */
  async getProgressSummary(): Promise<ProgressSummary> {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Fetch all decks and spaced repetition stats in parallel
    const [decks, spacedRepetition] = await Promise.all([
      db.deck.findMany({
        include: {
          cards: {
            select: {
              id: true,
              status: true,
              due: true,
              state: true,
            },
          },
          quizAttempts: {
            orderBy: {
              createdAt: "desc",
            },
            select: {
              id: true,
              accuracy: true,
              createdAt: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      fsrsService.getSpacedRepetitionStats(),
    ]);

    let totalCards = 0;
    let newCount = 0;
    let learningCount = 0;
    let knownCount = 0;
    let totalQuizAttempts = 0;
    let sumAccuracy = 0;

    const deckProgressItems: DeckProgressItem[] = decks.map((deck) => {
      const deckTotalCards = deck.cards.length;
      const deckNew = deck.cards.filter((c) => c.status === FlashcardStatus.NEW).length;
      const deckLearning = deck.cards.filter((c) => c.status === FlashcardStatus.LEARNING).length;
      const deckKnown = deck.cards.filter((c) => c.status === FlashcardStatus.KNOWN).length;
      const deckDueToday = deck.cards.filter(
        (c) => c.state > 0 && new Date(c.due) <= endOfToday
      ).length;

      const deckMasteryRate =
        deckTotalCards > 0 ? Number(((deckKnown / deckTotalCards) * 100).toFixed(1)) : 0;

      // Update globals
      totalCards += deckTotalCards;
      newCount += deckNew;
      learningCount += deckLearning;
      knownCount += deckKnown;

      const attemptsCount = deck.quizAttempts.length;
      totalQuizAttempts += attemptsCount;
      deck.quizAttempts.forEach((attempt) => {
        sumAccuracy += attempt.accuracy;
      });

      const latestAttempt = deck.quizAttempts[0] || null;

      return {
        id: deck.id,
        name: deck.name,
        description: deck.description,
        totalCards: deckTotalCards,
        newCount: deckNew,
        learningCount: deckLearning,
        knownCount: deckKnown,
        dueTodayCount: deckDueToday,
        masteryRate: deckMasteryRate,
        quizAttemptsCount: attemptsCount,
        lastQuizAccuracy: latestAttempt ? latestAttempt.accuracy : null,
        lastQuizAt: latestAttempt ? latestAttempt.createdAt : null,
        updatedAt: deck.updatedAt,
      };
    });

    const globalMasteryRate =
      totalCards > 0 ? Number(((knownCount / totalCards) * 100).toFixed(1)) : 0;
    const overallAccuracy =
      totalQuizAttempts > 0 ? Number((sumAccuracy / totalQuizAttempts).toFixed(1)) : 0;

    return {
      stats: {
        totalCards,
        newCount,
        learningCount,
        knownCount,
        masteryRate: globalMasteryRate,
        totalDecks: decks.length,
        totalQuizAttempts,
        overallAccuracy,
      },
      spacedRepetition,
      decks: deckProgressItems,
    };
  }
}

export const progressService = new ProgressService();
