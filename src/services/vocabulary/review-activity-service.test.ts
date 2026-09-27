import { describe, expect, it } from "vitest";
import {
  bucketReviewLogsByDate,
  buildReviewActivity,
  calculateCurrentStreak,
  calculateIntensity,
  calculateLongestStreak,
} from "./review-activity-service";

describe("review-activity-service", () => {
  describe("Current Streak calculation (Section 48 requirements)", () => {
    it("Case A: today active, yesterday active, day before active => 3", () => {
      const today = "2026-09-26";
      const active = new Set(["2026-09-24", "2026-09-25", "2026-09-26"]);
      expect(calculateCurrentStreak(active, today)).toBe(3);
    });

    it("Case B: today inactive, yesterday active, day before active => 2 (Today must NOT break streak before day ends)", () => {
      const today = "2026-09-26";
      const active = new Set(["2026-09-24", "2026-09-25"]); // today is NOT active
      expect(calculateCurrentStreak(active, today)).toBe(2);
    });

    it("Case C: today inactive, yesterday inactive => 0", () => {
      const today = "2026-09-26";
      const active = new Set(["2026-09-23", "2026-09-24"]); // gap on Sep 25 and Sep 26
      expect(calculateCurrentStreak(active, today)).toBe(0);
    });

    it("Case D: today active, yesterday inactive => 1", () => {
      const today = "2026-09-26";
      const active = new Set(["2026-09-22", "2026-09-26"]); // gaps before
      expect(calculateCurrentStreak(active, today)).toBe(1);
    });

    it("Case E: crosses month boundary (Jan 31 + Feb 1)", () => {
      const today = "2026-02-02";
      const active = new Set(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
      expect(calculateCurrentStreak(active, today)).toBe(4);

      // And when today Feb 2 is inactive, streak from Feb 1 backwards
      const activeWithoutToday = new Set(["2026-01-30", "2026-01-31", "2026-02-01"]);
      expect(calculateCurrentStreak(activeWithoutToday, today)).toBe(3);
    });

    it("Case F: crosses year boundary (Dec 31 + Jan 1)", () => {
      const today = "2027-01-02";
      const active = new Set(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
      expect(calculateCurrentStreak(active, today)).toBe(4);
    });
  });

  describe("Longest Streak calculation (Section 49 requirements)", () => {
    it("handles sequences with gaps (1,2,3 active; 4 empty; 5,6 active => 3)", () => {
      const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"];
      expect(calculateLongestStreak(dates)).toBe(3);
    });

    it("handles single active day => 1", () => {
      expect(calculateLongestStreak(["2026-09-15"])).toBe(1);
    });

    it("handles no activity => 0", () => {
      expect(calculateLongestStreak([])).toBe(0);
    });

    it("handles completely consecutive days across months", () => {
      const dates = [
        "2026-08-30",
        "2026-08-31",
        "2026-09-01",
        "2026-09-02",
        "2026-09-03",
      ];
      expect(calculateLongestStreak(dates)).toBe(5);
    });
  });

  describe("Timezone bucketing & boundary tests (Section 50 requirements)", () => {
    it("groups same UTC logs into different local dates depending on timezone", () => {
      // 2026-09-25 18:00 UTC = 2026-09-26 01:00 VN = 2026-09-25 14:00 NY
      const logs = [{ review: new Date("2026-09-25T18:00:00.000Z"), rating: 3 }];

      const bucketsVN = bucketReviewLogsByDate(logs, "Asia/Ho_Chi_Minh");
      expect(bucketsVN.get("2026-09-26")?.count).toBe(1);
      expect(bucketsVN.get("2026-09-25")).toBeUndefined();

      const bucketsNY = bucketReviewLogsByDate(logs, "America/New_York");
      expect(bucketsNY.get("2026-09-25")?.count).toBe(1);
      expect(bucketsNY.get("2026-09-26")).toBeUndefined();
    });

    it("ensures midnight reviews in VN (23:59 vs 00:01) stay in distinct date buckets", () => {
      const logs = [
        { review: new Date("2026-09-25T16:59:00.000Z"), rating: 3 }, // 23:59 VN
        { review: new Date("2026-09-25T17:01:00.000Z"), rating: 4 }, // 00:01 VN
      ];
      const buckets = bucketReviewLogsByDate(logs, "Asia/Ho_Chi_Minh");
      expect(buckets.get("2026-09-25")?.count).toBe(1);
      expect(buckets.get("2026-09-26")?.count).toBe(1);
    });
  });

  describe("Intensity mapping (Section 23, 24)", () => {
    it("maps 0 count strictly to intensity 0", () => {
      expect(calculateIntensity(0, 100)).toBe(0);
      expect(calculateIntensity(-1, 50)).toBe(0);
    });

    it("ensures higher count never maps to lighter color", () => {
      const max = 20;
      let prevIntensity = 0;
      for (let count = 0; count <= max; count++) {
        const intensity = calculateIntensity(count, max);
        expect(intensity).toBeGreaterThanOrEqual(prevIntensity);
        prevIntensity = intensity;
      }
    });

    it("scales nicely when maxCount is small", () => {
      expect(calculateIntensity(1, 2)).toBe(1);
      expect(calculateIntensity(2, 2)).toBe(2);
    });
  });

  describe("buildReviewActivity full integration", () => {
    it("builds 52 weeks of columns with future days disabled", () => {
      const now = new Date("2026-09-26T10:00:00.000Z"); // Saturday
      const logs = [
        { review: new Date("2026-09-24T05:00:00.000Z"), rating: 3 },
        { review: new Date("2026-09-25T05:00:00.000Z"), rating: 3 },
        { review: new Date("2026-09-26T05:00:00.000Z"), rating: 4 },
      ];

      const activity = buildReviewActivity({
        periodDays: 364,
        timezone: "Asia/Ho_Chi_Minh",
        now,
        allTimeLogs: logs,
      });

      expect(activity.metrics.currentStreak).toBe(3);
      expect(activity.metrics.longestStreak).toBe(3);
      expect(activity.metrics.activeDaysInPeriod).toBe(3);
      expect(activity.metrics.totalReviewsInPeriod).toBe(3);
      expect(activity.metrics.isTodayActive).toBe(true);

      expect(activity.weeks).toHaveLength(52);
      // Sunday of the current week (Sep 27) is in the future
      const todayCell = activity.days.find((d) => d.dateKey === "2026-09-26");
      expect(todayCell?.isToday).toBe(true);
      expect(todayCell?.isFuture).toBe(false);

      const tomorrowCell = activity.days.find((d) => d.dateKey === "2026-09-27");
      expect(tomorrowCell?.isFuture).toBe(true);
      expect(tomorrowCell?.intensity).toBe(0);
    });
  });
});
