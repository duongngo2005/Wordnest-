export const DEFAULT_STUDY_TIMEZONE = "Asia/Ho_Chi_Minh";
export const TIMEZONE_COOKIE_KEY = "wordnest.timezone.v1";
export const TIMEZONE_STORAGE_KEY = "wordnest.timezone.v1";
export const TIMEZONE_CHANGED_EVENT = "wordnest:timezone-changed";

/**
 * Validates whether a string is a valid IANA timezone supported by the runtime.
 */
export function isValidTimezone(timezone: string | null | undefined): boolean {
  if (!timezone || typeof timezone !== "string") return false;
  const trimmed = timezone.trim();
  if (!trimmed) return false;

  try {
    // Intl.DateTimeFormat will throw RangeError if timezone is invalid
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes an arbitrary timezone candidate into a validated IANA timezone,
 * falling back to DEFAULT_STUDY_TIMEZONE (Asia/Ho_Chi_Minh) if invalid.
 */
export function normalizeTimezone(timezone: string | null | undefined): string {
  if (isValidTimezone(timezone)) {
    return timezone!.trim();
  }
  return DEFAULT_STUDY_TIMEZONE;
}

/**
 * Formats a Date object or timestamp into a local calendar date string (YYYY-MM-DD)
 * in the specified IANA timezone. This handles both normal and DST transitions correctly.
 */
export function getLocalDateKey(date: Date | number, timezone: string = DEFAULT_STUDY_TIMEZONE): string {
  const tz = normalizeTimezone(timezone);
  const d = typeof date === "number" ? new Date(date) : date;

  // Use Intl.DateTimeFormat with en-CA which outputs YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(d);
}

/**
 * Gets the current calendar date key (YYYY-MM-DD) in the specified study timezone.
 */
export function getTodayDateKey(timezone: string = DEFAULT_STUDY_TIMEZONE, now: Date = new Date()): string {
  return getLocalDateKey(now, timezone);
}

/**
 * Parses a YYYY-MM-DD string into [year, month (1-indexed), day].
 */
function parseDateKey(dateKey: string): [number, number, number] {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid date key format: "${dateKey}". Expected YYYY-MM-DD.`);
  }
  return [parts[0], parts[1], parts[2]];
}

/**
 * Formats [year, month, day] into YYYY-MM-DD.
 */
function formatDateKeyParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Gets a date key offset by a number of calendar days from a reference date key.
 * This is pure Gregorian calendar math independent of UTC shifts or DST jumps.
 */
export function offsetDateKey(dateKey: string, dayOffset: number): string {
  const [year, month, day] = parseDateKey(dateKey);
  // Using UTC Date methods prevents any host-timezone skew
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + dayOffset);

  return formatDateKeyParts(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

/**
 * Gets the date key for the previous day (or N days back).
 */
export function getPreviousDateKey(dateKey: string, daysBack: number = 1): string {
  return offsetDateKey(dateKey, -daysBack);
}

/**
 * Gets the date key for the next day (or N days forward).
 */
export function getNextDateKey(dateKey: string, daysForward: number = 1): string {
  return offsetDateKey(dateKey, daysForward);
}

/**
 * Generates an inclusive list of date keys between startDateKey and endDateKey.
 */
export function enumerateDateKeys(startDateKey: string, endDateKey: string): string[] {
  if (startDateKey > endDateKey) return [];
  const keys: string[] = [];
  let current = startDateKey;
  while (current <= endDateKey) {
    keys.push(current);
    current = offsetDateKey(current, 1);
  }
  return keys;
}

/**
 * Gets day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday) for a YYYY-MM-DD key.
 */
export function getDayOfWeekFromDateKey(dateKey: string): number {
  const [year, month, day] = parseDateKey(dateKey);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return utcDate.getUTCDay();
}

/**
 * Formats a dateKey (YYYY-MM-DD) into a localized label for display (e.g. "T.7, 26/09/2026").
 */
export function formatDisplayDate(
  dateKey: string,
  options?: { includeWeekday?: boolean; includeYear?: boolean; locale?: string }
): string {
  const [year, month, day] = parseDateKey(dateKey);
  const locale = options?.locale ?? "vi-VN";
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: options?.includeWeekday !== false ? "short" : undefined,
    day: "numeric",
    month: "numeric",
    year: options?.includeYear !== false ? "numeric" : undefined,
  });

  return formatter.format(utcDate);
}

/**
 * Resolves the start Date (instant) of a calendar day in the given timezone.
 * Returns a UTC Date representing 00:00:00.000 in the target timezone.
 */
export function getStartOfDayInTimezone(dateKey: string, timezone: string = DEFAULT_STUDY_TIMEZONE): Date {
  const tz = normalizeTimezone(timezone);
  const [year, month, day] = parseDateKey(dateKey);

  // Approximate UTC time: 00:00:00 UTC
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  // Determine timezone offset in target timezone at that date
  // Using Intl formatToParts on the guess date
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(guess);

  const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const localYear = getPart("year");
  const localMonth = getPart("month");
  const localDay = getPart("day");
  let localHour = getPart("hour");
  if (localHour === 24) localHour = 0; // Some engines output 24 for midnight
  const localMinute = getPart("minute");

  const localTimeInGuess = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
  const targetLocalTime = Date.UTC(year, month - 1, day, 0, 0, 0);

  const diffMs = targetLocalTime - localTimeInGuess;
  return new Date(guess.getTime() + diffMs);
}

/**
 * Resolves the end Date (instant) of a calendar day in the given timezone.
 * Returns a UTC Date representing 23:59:59.999 in the target timezone.
 */
export function getEndOfDayInTimezone(dateKey: string, timezone: string = DEFAULT_STUDY_TIMEZONE): Date {
  const nextDayStart = getStartOfDayInTimezone(offsetDateKey(dateKey, 1), timezone);
  return new Date(nextDayStart.getTime() - 1);
}

/**
 * Common timezone display options for Settings
 */
export interface TimezoneOption {
  value: string;
  label: string;
  offsetLabel: string;
}

export const COMMON_STUDY_TIMEZONES: TimezoneOption[] = [
  { value: "Asia/Ho_Chi_Minh", label: "Việt Nam (Hà Nội, TP.HCM)", offsetLabel: "GMT+7" },
  { value: "Asia/Bangkok", label: "Thái Lan, Đông Nam Á", offsetLabel: "GMT+7" },
  { value: "Asia/Tokyo", label: "Nhật Bản (Tokyo)", offsetLabel: "GMT+9" },
  { value: "Asia/Seoul", label: "Hàn Quốc (Seoul)", offsetLabel: "GMT+9" },
  { value: "Asia/Singapore", label: "Singapore", offsetLabel: "GMT+8" },
  { value: "Australia/Sydney", label: "Úc (Sydney)", offsetLabel: "AEST/AEDT" },
  { value: "Europe/London", label: "Anh (London)", offsetLabel: "GMT/BST" },
  { value: "Europe/Paris", label: "Pháp, Trung Âu (Paris)", offsetLabel: "CET/CEST" },
  { value: "America/New_York", label: "Mỹ (New York, Bờ Đông)", offsetLabel: "EST/EDT" },
  { value: "America/Chicago", label: "Mỹ (Chicago, Miền Trung)", offsetLabel: "CST/CDT" },
  { value: "America/Los_Angeles", label: "Mỹ (Los Angeles, Bờ Tây)", offsetLabel: "PST/PDT" },
  { value: "UTC", label: "Giờ phối hợp quốc tế (UTC)", offsetLabel: "UTC" },
];

/**
 * Formats a timezone label with its current GMT offset.
 */
export function formatTimezoneOffsetLabel(timezone: string, date: Date = new Date()): string {
  const tz = normalizeTimezone(timezone);
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart ? tzPart.value : "";
  } catch {
    return "";
  }
}
