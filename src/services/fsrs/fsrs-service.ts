import {
  fsrs,
  generatorParameters,
  RecordLogItem,
} from "ts-fsrs";
import { db } from "@/lib/db";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { FlashcardStatus, Prisma, ReviewLog } from "@prisma/client";
import {
  Rating,
  Grade,
  State,
  FSRSReviewCardInput,
  ReviewOptionPreview,
  ReviewSchedulePreview,
  formatInterval,
  toFSRSCard,
  previewNextReviews,
} from "@/lib/fsrs";

export {
  Rating,
  State,
  formatInterval,
  toFSRSCard,
  previewNextReviews,
};
export type {
  FSRSReviewCardInput,
  ReviewOptionPreview,
  ReviewSchedulePreview,
};

export interface DailyForecastDay {
  date: string; // YYYY-MM-DD
  dayLabel: string; // "Hôm nay", "Ngày mai", "T2", "T3"...
  count: number;
}

export interface SpacedRepetitionStats {
  dueTodayCount: number;
  overdueCount: number;
  reviewedTodayCount: number;
  newCardsCount: number;
  learningCardsCount: number;
  matureCardsCount: number; // Cards with interval >= 21 days or Review state
  reviewAccuracy: number; // % rating >= 3
  forecast: DailyForecastDay[];
}

export const DEFAULT_NEW_CARDS_PER_REVIEW_SESSION = 20;
const DEFAULT_REVIEW_CARDS_PER_SESSION = 100;

export interface ScheduledReviewInput {
  rating: Rating;
  reviewEventId: string;
  expectedSchedulerVersion: number;
  now?: Date;
}

export class ScheduledReviewConflictError extends Error {
  constructor(message = "Thẻ đã được ôn ở một phiên khác. Vui lòng tải lại hàng đợi ôn tập.") {
    super(message);
    this.name = "ScheduledReviewConflictError";
  }
}

export class ScheduledReviewNotDueError extends Error {
  constructor() {
    super("Thẻ này chưa đến hạn ôn tập.");
    this.name = "ScheduledReviewNotDueError";
  }
}

export class FSRSService {
  private scheduler = fsrs(
    generatorParameters({
      request_retention: 0.9,
      maximum_interval: 36500,
      enable_fuzz: true,
    })
  );

  formatInterval(due: Date, now: Date = new Date()): string {
    return formatInterval(due, now);
  }

  toFSRSCard(card: FSRSReviewCardInput) {
    return toFSRSCard(card);
  }

  previewNextReviews(
    card: FSRSReviewCardInput,
    now: Date = new Date()
  ): ReviewSchedulePreview {
    return previewNextReviews(card, now);
  }

  /**
   * Maps FSRS State to traditional FlashcardStatus enum for backwards compatibility.
   */
  mapStateToFlashcardStatus(state: State): FlashcardStatus {
    switch (state) {
      case State.New:
        return FlashcardStatus.NEW;
      case State.Learning:
      case State.Relearning:
        return FlashcardStatus.LEARNING;
      case State.Review:
        return FlashcardStatus.KNOWN;
      default:
        return FlashcardStatus.LEARNING;
    }
  }

  /**
   * The sole runtime entry point that changes an existing card's scheduler state.
   * The idempotency key and version check deliberately live in the same database
   * transaction as the FSRS calculation, state write, and official review history.
   */
  async processScheduledReview(cardId: string, input: ScheduledReviewInput) {
    const now = input.now ?? new Date();

    const existing = await db.reviewLog.findUnique({
      where: { reviewEventId: input.reviewEventId },
    });
    if (existing) {
      return this.getIdempotentReviewResult(cardId, existing, now);
    }

    try {
      return await db.$transaction(async (tx) => {
        const duplicate = await tx.reviewLog.findUnique({
          where: { reviewEventId: input.reviewEventId },
        });
        if (duplicate) {
          return this.getIdempotentReviewResult(cardId, duplicate, now, tx);
        }

        const card = await tx.flashcard.findUnique({ where: { id: cardId } });
        if (!card) {
          throw new ResourceNotFoundError(`Không tìm thấy thẻ từ vựng: ${cardId}`);
        }
        if (card.schedulerVersion !== input.expectedSchedulerVersion) {
          throw new ScheduledReviewConflictError();
        }
        if (card.state !== State.New && card.due > now) {
          throw new ScheduledReviewNotDueError();
        }

        const fsrsCard = this.toFSRSCard(card);
        const repeatResults = this.scheduler.repeat(fsrsCard, now);
        const chosenResult: RecordLogItem = repeatResults[input.rating as Grade];
        if (!chosenResult) {
          throw new Error(`Invalid rating ${input.rating}`);
        }

        const nextCard = chosenResult.card;
        const log = chosenResult.log;
        const status = this.mapStateToFlashcardStatus(nextCard.state);
        const update = await tx.flashcard.updateMany({
          where: { id: cardId, schedulerVersion: input.expectedSchedulerVersion },
          data: {
            due: nextCard.due,
            stability: nextCard.stability,
            difficulty: nextCard.difficulty,
            elapsedDays: nextCard.elapsed_days,
            scheduledDays: nextCard.scheduled_days,
            learningSteps: nextCard.learning_steps,
            reps: nextCard.reps,
            lapses: nextCard.lapses,
            state: nextCard.state,
            lastReviewAt: now,
            status,
            schedulerVersion: { increment: 1 },
          },
        });
        if (update.count !== 1) {
          throw new ScheduledReviewConflictError();
        }

        const [updatedCard, createdLog] = await Promise.all([
          tx.flashcard.findUniqueOrThrow({ where: { id: cardId } }),
          tx.reviewLog.create({
            data: {
              cardId,
              rating: log.rating,
              state: log.state,
              due: log.due,
              stability: log.stability,
              difficulty: log.difficulty,
              elapsedDays: log.elapsed_days,
              lastElapsedDays: log.last_elapsed_days,
              scheduledDays: log.scheduled_days,
              reviewEventId: input.reviewEventId,
              review: now,
            },
          }),
        ]);

        return {
          card: updatedCard,
          log: createdLog,
          nextDue: updatedCard.due,
          intervalText: this.formatInterval(updatedCard.due, now),
          status,
          idempotent: false,
        };
      });
    } catch (error) {
      if (error instanceof ScheduledReviewConflictError) {
        const duplicate = await db.reviewLog.findUnique({
          where: { reviewEventId: input.reviewEventId },
        });
        if (duplicate) {
          return this.getIdempotentReviewResult(cardId, duplicate, now);
        }
      }
      throw error;
    }
  }

  private async getIdempotentReviewResult(
    cardId: string,
    log: ReviewLog,
    now: Date,
    client: Pick<typeof db, "flashcard"> = db
  ) {
    if (log.cardId !== cardId) {
      throw new ScheduledReviewConflictError("Mã lượt ôn không thuộc về thẻ này.");
    }
    const card = await client.flashcard.findUnique({ where: { id: cardId } });
    if (!card) {
      throw new ResourceNotFoundError(`Không tìm thấy thẻ từ vựng: ${cardId}`);
    }
    return {
      card,
      log,
      nextDue: card.due,
      intervalText: this.formatInterval(card.due, now),
      status: card.status,
      idempotent: true,
    };
  }

  /**
   * Retrieves the daily review queue for a deck or across all decks.
   * Priority:
   * 1. Overdue cards (due < startOfToday)
   * 2. Due today (due <= endOfToday)
   * 3. New cards (state = 0, up to newLimit)
   */
  async getReviewQueue(options: {
    deckId?: string;
    folderId?: string;
    now?: Date;
    newLimit?: number;
    reviewLimit?: number;
  }) {
    const now = options.now || new Date();
    const baseWhere: Prisma.FlashcardWhereInput = {
      ...(options.deckId ? { deckId: options.deckId } : {}),
      ...(options.folderId ? { deck: { folderId: options.folderId } } : {}),
    };

    // 1. Due / Overdue review cards
    const dueCards = await db.flashcard.findMany({
      where: {
        ...baseWhere,
        due: { lte: now },
        state: { gt: 0 },
      },
      orderBy: [{ due: "asc" }, { reps: "desc" }],
      take: options.reviewLimit ?? DEFAULT_REVIEW_CARDS_PER_SESSION,
    });

    // 2. New cards (never reviewed before)
    const newCards = await db.flashcard.findMany({
      where: {
        ...baseWhere,
        state: 0,
      },
      orderBy: { createdAt: "asc" },
      take: options.newLimit ?? DEFAULT_NEW_CARDS_PER_REVIEW_SESSION,
    });

    return {
      dueCards,
      newCards,
      queue: [...dueCards, ...newCards],
      totalDue: dueCards.length,
      totalNew: newCards.length,
    };
  }

  /**
   * Computes Spaced Repetition statistics for the dashboard.
   */
  async getSpacedRepetitionStats(
    deckId?: string,
    now: Date = new Date()
  ): Promise<SpacedRepetitionStats> {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const cardWhere: Prisma.FlashcardWhereInput = deckId ? { deckId } : {};

    // Query cards in parallel
    const [
      allCards,
      reviewedTodayLogs,
      totalLogs,
      successfulLogs,
    ] = await Promise.all([
      db.flashcard.findMany({
        where: cardWhere,
        select: {
          id: true,
          due: true,
          state: true,
          scheduledDays: true,
          stability: true,
        },
      }),
      db.reviewLog.count({
        where: {
          review: { gte: startOfToday, lte: endOfToday },
          ...(deckId ? { card: { deckId } } : {}),
        },
      }),
      db.reviewLog.count({
        where: deckId ? { card: { deckId } } : {},
      }),
      db.reviewLog.count({
        where: {
          rating: { gte: 3 }, // Good or Easy
          ...(deckId ? { card: { deckId } } : {}),
        },
      }),
    ]);

    let dueTodayCount = 0;
    let overdueCount = 0;
    let newCardsCount = 0;
    let learningCardsCount = 0;
    let matureCardsCount = 0;

    // 7-day forecast buckets
    const forecastMap = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      forecastMap.set(key, 0);
    }

    for (const card of allCards) {
      if (card.state === 0) {
        newCardsCount++;
      } else if (card.state === 1 || card.state === 3) {
        learningCardsCount++;
      } else if (card.state === 2) {
        if (card.scheduledDays >= 21 || card.stability >= 21) {
          matureCardsCount++;
        }
      }

      // Check due status for non-new cards
      if (card.state > 0) {
        if (card.due < startOfToday) {
          overdueCount++;
          dueTodayCount++;
          // Overdue cards are due today in forecast
          const todayKey = startOfToday.toISOString().split("T")[0];
          forecastMap.set(todayKey, (forecastMap.get(todayKey) || 0) + 1);
        } else if (card.due <= endOfToday) {
          dueTodayCount++;
          const todayKey = startOfToday.toISOString().split("T")[0];
          forecastMap.set(todayKey, (forecastMap.get(todayKey) || 0) + 1);
        } else {
          // Future due dates within 7 days
          const dueKey = new Date(card.due).toISOString().split("T")[0];
          if (forecastMap.has(dueKey)) {
            forecastMap.set(dueKey, (forecastMap.get(dueKey) || 0) + 1);
          }
        }
      }
    }

    const forecast: DailyForecastDay[] = Array.from(forecastMap.entries()).map(
      ([date, count], index) => {
        let dayLabel: string;
        if (index === 0) dayLabel = "Hôm nay";
        else if (index === 1) dayLabel = "Ngày mai";
        else {
          const d = new Date(date + "T00:00:00");
          const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
          dayLabel = `${days[d.getDay()]} (${d.getDate()}/${d.getMonth() + 1})`;
        }
        return { date, dayLabel, count };
      }
    );

    const reviewAccuracy =
      totalLogs > 0 ? Number(((successfulLogs / totalLogs) * 100).toFixed(1)) : 100;

    return {
      dueTodayCount,
      overdueCount,
      reviewedTodayCount: reviewedTodayLogs,
      newCardsCount,
      learningCardsCount,
      matureCardsCount,
      reviewAccuracy,
      forecast,
    };
  }
}

export const fsrsService = new FSRSService();
