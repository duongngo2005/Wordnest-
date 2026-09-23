import {
  fsrs,
  generatorParameters,
  Rating,
  Grade,
  State,
  Card as FSRSCard,
  RecordLogItem,
  createEmptyCard,
} from "ts-fsrs";

export { Rating, State };
export type { Grade };

export interface FSRSReviewCardInput {
  due?: Date | string;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  learningSteps?: number;
  reps?: number;
  lapses?: number;
  state?: number;
  lastReviewAt?: Date | string | null;
}

export interface ReviewOptionPreview {
  rating: Rating;
  ratingLabel: "Again" | "Hard" | "Good" | "Easy";
  due: Date;
  intervalText: string;
  cardState: State;
}

export interface ReviewSchedulePreview {
  again: ReviewOptionPreview;
  hard: ReviewOptionPreview;
  good: ReviewOptionPreview;
  easy: ReviewOptionPreview;
}

const defaultScheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: true,
  })
);

/**
 * Formats a time delta into a friendly short string (e.g. 10m, 1d, 3d, 1mo).
 */
export function formatInterval(due: Date, now: Date = new Date()): string {
  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 0) return "< 1m";
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  const diffYears = Math.round(diffDays / 365);
  return `${diffYears}y`;
}

/**
 * Converts card data into a ts-fsrs Card object.
 */
export function toFSRSCard(card: FSRSReviewCardInput): FSRSCard {
  const reps = card.reps ?? 0;
  const stability = card.stability ?? 0;
  const state = card.state ?? 0;

  if (state === 0 && reps === 0 && stability === 0) {
    return createEmptyCard(card.due ? new Date(card.due) : new Date());
  }

  return {
    due: card.due ? new Date(card.due) : new Date(),
    stability: stability,
    difficulty: card.difficulty ?? 0,
    elapsed_days: card.elapsedDays ?? 0,
    scheduled_days: card.scheduledDays ?? 0,
    reps: reps,
    lapses: card.lapses ?? 0,
    learning_steps: card.learningSteps ?? 0,
    state: (state as State) ?? State.New,
    last_review: card.lastReviewAt ? new Date(card.lastReviewAt) : undefined,
  };
}

/**
 * Calculates next review dates and formatted intervals for all 4 ratings (Again, Hard, Good, Easy)
 * without touching any database.
 */
export function previewNextReviews(
  card: FSRSReviewCardInput,
  now: Date = new Date()
): ReviewSchedulePreview {
  const fsrsCard = toFSRSCard(card);
  const repeatResults = defaultScheduler.repeat(fsrsCard, now);

  const getPreview = (
    rating: Rating,
    label: "Again" | "Hard" | "Good" | "Easy"
  ): ReviewOptionPreview => {
    const item: RecordLogItem = repeatResults[rating as Grade];
    return {
      rating,
      ratingLabel: label,
      due: item.card.due,
      intervalText: formatInterval(item.card.due, now),
      cardState: item.card.state,
    };
  };

  return {
    again: getPreview(Rating.Again, "Again"),
    hard: getPreview(Rating.Hard, "Hard"),
    good: getPreview(Rating.Good, "Good"),
    easy: getPreview(Rating.Easy, "Easy"),
  };
}
