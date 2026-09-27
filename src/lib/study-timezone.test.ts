import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUDY_TIMEZONE,
  enumerateDateKeys,
  formatDisplayDate,
  getDayOfWeekFromDateKey,
  getEndOfDayInTimezone,
  getLocalDateKey,
  getNextDateKey,
  getPreviousDateKey,
  getStartOfDayInTimezone,
  getTodayDateKey,
  isValidTimezone,
  normalizeTimezone,
  offsetDateKey,
} from "./study-timezone";

describe("study-timezone utilities", () => {
  describe("isValidTimezone & normalizeTimezone", () => {
    it("validates standard IANA timezones", () => {
      expect(isValidTimezone("Asia/Ho_Chi_Minh")).toBe(true);
      expect(isValidTimezone("America/New_York")).toBe(true);
      expect(isValidTimezone("Europe/London")).toBe(true);
      expect(isValidTimezone("UTC")).toBe(true);
    });

    it("rejects invalid or arbitrary strings safely without throwing", () => {
      expect(isValidTimezone("")).toBe(false);
      expect(isValidTimezone(null)).toBe(false);
      expect(isValidTimezone(undefined)).toBe(false);
      expect(isValidTimezone("Not/A_Real_Timezone")).toBe(false);
      expect(isValidTimezone("GMT+7")).toBe(false); // Only IANA timezones
      expect(isValidTimezone("random-text")).toBe(false);
    });

    it("normalizes invalid timezones to DEFAULT_STUDY_TIMEZONE (Asia/Ho_Chi_Minh)", () => {
      expect(normalizeTimezone("Invalid/Tz")).toBe(DEFAULT_STUDY_TIMEZONE);
      expect(normalizeTimezone("")).toBe(DEFAULT_STUDY_TIMEZONE);
      expect(normalizeTimezone(null)).toBe(DEFAULT_STUDY_TIMEZONE);
      expect(normalizeTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
    });
  });

  describe("getLocalDateKey and timezone mapping", () => {
    it("maps UTC event 2026-09-25T18:30:00Z to 2026-09-26 in Asia/Ho_Chi_Minh (UTC+7)", () => {
      // 18:30 UTC on Sep 25 = 01:30 AM on Sep 26 in Vietnam
      const date = new Date("2026-09-25T18:30:00.000Z");
      const localKeyVN = getLocalDateKey(date, "Asia/Ho_Chi_Minh");
      expect(localKeyVN).toBe("2026-09-26");

      // In UTC, it is still Sep 25
      const localKeyUTC = getLocalDateKey(date, "UTC");
      expect(localKeyUTC).toBe("2026-09-25");
    });

    it("distinguishes midnight boundaries in Asia/Ho_Chi_Minh", () => {
      // 23:59:59 local in VN on 2026-09-25 = 16:59:59 UTC on 2026-09-25
      const beforeMidnight = new Date("2026-09-25T16:59:59.000Z");
      // 00:00:01 local in VN on 2026-09-26 = 17:00:01 UTC on 2026-09-25
      const afterMidnight = new Date("2026-09-25T17:00:01.000Z");

      expect(getLocalDateKey(beforeMidnight, "Asia/Ho_Chi_Minh")).toBe("2026-09-25");
      expect(getLocalDateKey(afterMidnight, "Asia/Ho_Chi_Minh")).toBe("2026-09-26");
    });

    it("handles DST timezones correctly (e.g. America/New_York)", () => {
      // Nov 1, 2026: DST ends in US (clocks turn back at 2:00 AM EDT -> 1:00 AM EST)
      // 2026-11-01 01:30 EDT = 05:30 UTC
      const edt = new Date("2026-11-01T05:30:00.000Z");
      // 2026-11-01 01:30 EST = 06:30 UTC
      const est = new Date("2026-11-01T06:30:00.000Z");

      expect(getLocalDateKey(edt, "America/New_York")).toBe("2026-11-01");
      expect(getLocalDateKey(est, "America/New_York")).toBe("2026-11-01");

      // 2026-11-01 23:30 EST = 2026-11-02 04:30 UTC
      const lateNightNY = new Date("2026-11-02T04:30:00.000Z");
      expect(getLocalDateKey(lateNightNY, "America/New_York")).toBe("2026-11-01");

      // 2026-11-02 00:30 EST = 2026-11-02 05:30 UTC
      const nextDayEarlyNY = new Date("2026-11-02T05:30:00.000Z");
      expect(getLocalDateKey(nextDayEarlyNY, "America/New_York")).toBe("2026-11-02");
    });

    it("calculates today date key based on provided now and timezone", () => {
      const fixedNow = new Date("2026-09-25T19:00:00.000Z");
      expect(getTodayDateKey("Asia/Ho_Chi_Minh", fixedNow)).toBe("2026-09-26");
      expect(getTodayDateKey("America/New_York", fixedNow)).toBe("2026-09-25");
    });
  });

  describe("calendar date math (offset, previous, next, enumerate)", () => {
    it("offsets date across normal days", () => {
      expect(offsetDateKey("2026-09-15", 3)).toBe("2026-09-18");
      expect(offsetDateKey("2026-09-18", -3)).toBe("2026-09-15");
    });

    it("offsets date across month boundary (Jan 31 + 1 day = Feb 1)", () => {
      expect(offsetDateKey("2026-01-31", 1)).toBe("2026-02-01");
      expect(offsetDateKey("2026-02-01", -1)).toBe("2026-01-31");
    });

    it("offsets date across leap year February (2024 leap year, 2026 non-leap year)", () => {
      // 2024 is leap year
      expect(offsetDateKey("2024-02-28", 1)).toBe("2024-02-29");
      expect(offsetDateKey("2024-02-29", 1)).toBe("2024-03-01");

      // 2026 is non-leap year
      expect(offsetDateKey("2026-02-28", 1)).toBe("2026-03-01");
    });

    it("offsets date across year boundary (Dec 31 + 1 day = Jan 1)", () => {
      expect(offsetDateKey("2026-12-31", 1)).toBe("2027-01-01");
      expect(offsetDateKey("2027-01-01", -1)).toBe("2026-12-31");
    });

    it("provides getPreviousDateKey and getNextDateKey", () => {
      expect(getPreviousDateKey("2026-10-01")).toBe("2026-09-30");
      expect(getNextDateKey("2026-09-30")).toBe("2026-10-01");
    });

    it("enumerates date keys inclusively", () => {
      const dates = enumerateDateKeys("2026-09-28", "2026-10-02");
      expect(dates).toEqual([
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
        "2026-10-01",
        "2026-10-02",
      ]);
    });

    it("returns empty array when startDateKey > endDateKey", () => {
      expect(enumerateDateKeys("2026-10-02", "2026-09-28")).toEqual([]);
    });

    it("computes day of week correctly (0=Sun, 6=Sat)", () => {
      // 2026-09-26 is a Saturday
      expect(getDayOfWeekFromDateKey("2026-09-26")).toBe(6);
      // 2026-09-27 is a Sunday
      expect(getDayOfWeekFromDateKey("2026-09-27")).toBe(0);
      // 2026-09-28 is a Monday
      expect(getDayOfWeekFromDateKey("2026-09-28")).toBe(1);
    });

    it("formats display date in vi-VN locale without crashing", () => {
      const formatted = formatDisplayDate("2026-09-26");
      expect(formatted).toContain("26");
      expect(formatted).toContain("9");
      expect(formatted).toContain("2026");
    });
  });

  describe("getStartOfDayInTimezone & getEndOfDayInTimezone", () => {
    it("resolves start and end of day in Asia/Ho_Chi_Minh (UTC+7)", () => {
      const start = getStartOfDayInTimezone("2026-09-26", "Asia/Ho_Chi_Minh");
      // 2026-09-26 00:00:00 VN = 2026-09-25 17:00:00 UTC
      expect(start.toISOString()).toBe("2026-09-25T17:00:00.000Z");

      const end = getEndOfDayInTimezone("2026-09-26", "Asia/Ho_Chi_Minh");
      // 2026-09-26 23:59:59.999 VN = 2026-09-26 16:59:59.999 UTC
      expect(end.toISOString()).toBe("2026-09-26T16:59:59.999Z");
    });

    it("ensures startOfDay maps back to the same local date key", () => {
      const start = getStartOfDayInTimezone("2026-09-26", "Asia/Ho_Chi_Minh");
      expect(getLocalDateKey(start, "Asia/Ho_Chi_Minh")).toBe("2026-09-26");

      const end = getEndOfDayInTimezone("2026-09-26", "Asia/Ho_Chi_Minh");
      expect(getLocalDateKey(end, "Asia/Ho_Chi_Minh")).toBe("2026-09-26");
    });
  });
});
