import { db } from "@/lib/db";
import { getTodayDateKey, normalizeTimezone } from "@/lib/study-timezone";

export const MAX_ONLINE_ACTIVITY_SECONDS_PER_REPORT = 75;

export class OnlineActivityService {
  async recordActiveSeconds(seconds: number, timezone?: string) {
    const activeSeconds = Math.min(
      MAX_ONLINE_ACTIVITY_SECONDS_PER_REPORT,
      Math.max(1, Math.floor(seconds))
    );
    const date = getTodayDateKey(normalizeTimezone(timezone));

    return db.dailyOnlineActivity.upsert({
      where: { date },
      create: { date, activeSeconds },
      update: { activeSeconds: { increment: activeSeconds } },
      select: { date: true, activeSeconds: true },
    });
  }
}

export const onlineActivityService = new OnlineActivityService();
