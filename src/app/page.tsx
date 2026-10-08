import React from "react";
import { db } from "@/lib/db";
import { Header } from "@/components/ui/Header";
import { TodayPostcard } from "@/components/home/TodayPostcard";
import { FolderLibrary } from "@/components/folders/FolderLibrary";
import { folderService, todayLearningService } from "@/services/vocabulary";
import { getServerStudyTimezone } from "@/lib/study-timezone-server";
import { getTodayDateKey, getStartOfDayInTimezone, offsetDateKey } from "@/lib/study-timezone";
import { composeTodayLearningPlan, getBoundedTodayDeckContext } from "@/lib/today-learning-plan";

export const revalidate = 0;

export default async function HomePage() {
  const now = new Date();
  const timezone = await getServerStudyTimezone();
  const todayKey = getTodayDateKey(timezone, now);
  const todayStart = getStartOfDayInTimezone(todayKey, timezone);
  const tomorrowStart = getStartOfDayInTimezone(offsetDateKey(todayKey, 1), timezone);
  const [library, todayDeckStates, reviewedTodayCards] = await Promise.all([
    folderService.getLibrary(),
    todayLearningService.getTodayDeckStates(now),
    db.reviewLog.groupBy({
      by: ["cardId"],
      where: {
        review: { gte: todayStart, lt: tomorrowStart },
      },
    }),
  ]);
  const plan = composeTodayLearningPlan(todayDeckStates);
  const secondaryContext = getBoundedTodayDeckContext(todayDeckStates, plan);
  const reviewedTodayCount = reviewedTodayCards.length;

  return (
    <div className="app-shell">
      <Header />
      <main className="page-container wn-page wn-stack">
        <TodayPostcard
          plan={plan}
          reviewedTodayCount={reviewedTodayCount}
          secondaryDecks={secondaryContext.items}
          secondaryDecksRemainingCount={secondaryContext.remainingCount}
          date={now}
        />

        {/* Library Content */}
        <FolderLibrary {...library} />
      </main>
    </div>
  );
}
