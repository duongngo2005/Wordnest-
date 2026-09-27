import {
  DEFAULT_STUDY_TIMEZONE,
  enumerateDateKeys,
  formatDisplayDate,
  getDayOfWeekFromDateKey,
  getLocalDateKey,
  getNextDateKey,
  getPreviousDateKey,
  getTodayDateKey,
  offsetDateKey,
} from "@/lib/study-timezone";

export interface ReviewLogMinimal {
  review: Date;
  rating?: number;
  cardId?: string;
}

export interface DayRatingBreakdown {
  again: number; // 1
  hard: number;  // 2
  good: number;  // 3
  easy: number;  // 4
}

export interface HeatmapDayCell {
  dateKey: string;
  displayDate: string;
  count: number;
  ratings: DayRatingBreakdown;
  isToday: boolean;
  isFuture: boolean;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapWeekColumn {
  weekIndex: number;
  days: HeatmapDayCell[];
  monthLabel?: string; // e.g. "T9" or "Th09"
}

export interface ReviewStreakMetrics {
  currentStreak: number;
  longestStreak: number;
  activeDaysInPeriod: number;
  totalReviewsInPeriod: number;
  isTodayActive: boolean;
  todayReviewCount: number;
}

export interface ReviewActivityData {
  timezone: string;
  todayDateKey: string;
  metrics: ReviewStreakMetrics;
  days: HeatmapDayCell[];
  weeks: HeatmapWeekColumn[];
  allActiveDates: string[];
}

/**
 * Calculates Current Streak based on consecutive active days.
 * UX Rule: Today must not break the streak before the day is over.
 * - If today is active: count consecutive days backward starting today.
 * - Else if yesterday is active: count consecutive days backward starting yesterday.
 * - Else: current streak = 0.
 */
export function calculateCurrentStreak(
  activeDateKeys: Set<string>,
  todayDateKey: string
): number {
  if (activeDateKeys.has(todayDateKey)) {
    let streak = 0;
    let checkDate = todayDateKey;
    while (activeDateKeys.has(checkDate)) {
      streak += 1;
      checkDate = getPreviousDateKey(checkDate, 1);
    }
    return streak;
  }

  const yesterdayDateKey = getPreviousDateKey(todayDateKey, 1);
  if (activeDateKeys.has(yesterdayDateKey)) {
    let streak = 0;
    let checkDate = yesterdayDateKey;
    while (activeDateKeys.has(checkDate)) {
      streak += 1;
      checkDate = getPreviousDateKey(checkDate, 1);
    }
    return streak;
  }

  return 0;
}

/**
 * Calculates Longest Streak across all active dates in history.
 * - Sorts unique active dates ascending.
 * - Finds the longest consecutive sequence of calendar days.
 */
export function calculateLongestStreak(activeDateKeys: Iterable<string>): number {
  const dates = Array.from(new Set(activeDateKeys)).sort();
  if (dates.length === 0) return 0;

  let maxStreak = 1;
  let currentRun = 1;

  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1];
    const curr = dates[i];
    const expectedNext = getNextDateKey(prev, 1);

    if (curr === expectedNext) {
      currentRun += 1;
      if (currentRun > maxStreak) {
        maxStreak = currentRun;
      }
    } else {
      currentRun = 1;
    }
  }

  return maxStreak;
}

/**
 * Groups ReviewLog instances by local dateKey in the given study timezone.
 */
export function bucketReviewLogsByDate(
  reviewLogs: ReviewLogMinimal[],
  timezone: string = DEFAULT_STUDY_TIMEZONE
): Map<string, { count: number; ratings: DayRatingBreakdown }> {
  const buckets = new Map<string, { count: number; ratings: DayRatingBreakdown }>();

  for (const log of reviewLogs) {
    const key = getLocalDateKey(log.review, timezone);
    let entry = buckets.get(key);
    if (!entry) {
      entry = { count: 0, ratings: { again: 0, hard: 0, good: 0, easy: 0 } };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (log.rating === 1) entry.ratings.again += 1;
    else if (log.rating === 2) entry.ratings.hard += 1;
    else if (log.rating === 3) entry.ratings.good += 1;
    else if (log.rating === 4) entry.ratings.easy += 1;
  }

  return buckets;
}

/**
 * Determines intensity (0-4) using dynamic quartiles on non-zero review counts.
 */
export function calculateIntensity(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (maxCount <= 1) return 1;
  if (maxCount <= 4) {
    return Math.min(4, count) as 1 | 2 | 3 | 4;
  }

  const q1 = Math.max(1, Math.round(maxCount * 0.25));
  const q2 = Math.max(q1 + 1, Math.round(maxCount * 0.5));
  const q3 = Math.max(q2 + 1, Math.round(maxCount * 0.75));

  if (count >= q3) return 4;
  if (count >= q2) return 3;
  if (count >= q1) return 2;
  return 1;
}

export interface BuildHeatmapOptions {
  periodDays?: number; // e.g. 91 (~3 months / 13 weeks) or 364 (~52 weeks)
  timezone?: string;
  now?: Date;
  allTimeLogs?: ReviewLogMinimal[]; // for longest streak calculation
}

/**
 * Builds the complete heatmap grid and streak summary for a given period.
 * Weeks are structured Sunday (0) to Saturday (6) or Monday (1) to Sunday (0).
 * WordNest uses Monday-first (T2..CN) layout which aligns naturally with Vietnamese calendars.
 */
export function buildReviewActivity({
  periodDays = 364, // 52 weeks default
  timezone = DEFAULT_STUDY_TIMEZONE,
  now = new Date(),
  allTimeLogs = [],
}: BuildHeatmapOptions): ReviewActivityData {
  const todayKey = getTodayDateKey(timezone, now);
  const buckets = bucketReviewLogsByDate(allTimeLogs, timezone);

  // All active dates across history
  const allActiveDates = Array.from(buckets.keys()).filter((k) => (buckets.get(k)?.count ?? 0) > 0);
  const activeDateSet = new Set(allActiveDates);

  const currentStreak = calculateCurrentStreak(activeDateSet, todayKey);
  const longestStreak = Math.max(currentStreak, calculateLongestStreak(allActiveDates));

  // Calendar grid calculation:
  // We want the grid to end at the end of the current week (Sunday).
  // In Monday-first (0 = Monday, ..., 6 = Sunday):
  const rawDayOfWeek = getDayOfWeekFromDateKey(todayKey); // 0=Sun, 1=Mon, ..., 6=Sat
  // Convert to Monday=0, Tuesday=1, ..., Sunday=6
  const mondayFirstDayOfWeek = rawDayOfWeek === 0 ? 6 : rawDayOfWeek - 1;

  // End date is Sunday of the current week
  const daysUntilSunday = 6 - mondayFirstDayOfWeek;
  const gridEndKey = offsetDateKey(todayKey, daysUntilSunday);

  // Calculate number of full weeks to cover periodDays
  // e.g. 52 weeks = 52 * 7 = 364 days
  const totalWeeks = Math.ceil(periodDays / 7);
  const totalDays = totalWeeks * 7;
  const gridStartKey = offsetDateKey(gridEndKey, -(totalDays - 1));

  const allGridKeys = enumerateDateKeys(gridStartKey, gridEndKey);

  // Find max count in visible period for dynamic quantile intensity
  let maxVisibleCount = 0;
  for (const key of allGridKeys) {
    if (key <= todayKey) {
      const c = buckets.get(key)?.count ?? 0;
      if (c > maxVisibleCount) maxVisibleCount = c;
    }
  }

  let activeDaysInPeriod = 0;
  let totalReviewsInPeriod = 0;

  const cells: HeatmapDayCell[] = allGridKeys.map((key) => {
    const isToday = key === todayKey;
    const isFuture = key > todayKey;
    const bucket = buckets.get(key);
    const count = isFuture ? 0 : bucket?.count ?? 0;
    const ratings = isFuture
      ? { again: 0, hard: 0, good: 0, easy: 0 }
      : bucket?.ratings ?? { again: 0, hard: 0, good: 0, easy: 0 };

    if (!isFuture && count > 0) {
      activeDaysInPeriod += 1;
      totalReviewsInPeriod += count;
    }

    const intensity = isFuture ? 0 : calculateIntensity(count, maxVisibleCount);

    return {
      dateKey: key,
      displayDate: formatDisplayDate(key, { includeWeekday: true, includeYear: true }),
      count,
      ratings,
      isToday,
      isFuture,
      intensity,
    };
  });

  // Organize cells into weekly columns (each column has 7 days: Monday to Sunday)
  const weeks: HeatmapWeekColumn[] = [];
  let previousMonth = -1;

  for (let w = 0; w < totalWeeks; w++) {
    const weekCells = cells.slice(w * 7, (w + 1) * 7);
    // Determine month label if this week starts or contains the beginning of a new month
    let monthLabel: string | undefined;
    const firstCell = weekCells[0];
    if (firstCell) {
      const monthNumber = Number(firstCell.dateKey.split("-")[1]);
      if (monthNumber !== previousMonth) {
        monthLabel = `T${monthNumber}`;
        previousMonth = monthNumber;
      }
    }

    weeks.push({
      weekIndex: w,
      days: weekCells,
      monthLabel,
    });
  }

  const todayReviewCount = buckets.get(todayKey)?.count ?? 0;

  return {
    timezone,
    todayDateKey: todayKey,
    metrics: {
      currentStreak,
      longestStreak,
      activeDaysInPeriod,
      totalReviewsInPeriod,
      isTodayActive: todayReviewCount > 0,
      todayReviewCount,
    },
    days: cells,
    weeks,
    allActiveDates,
  };
}
