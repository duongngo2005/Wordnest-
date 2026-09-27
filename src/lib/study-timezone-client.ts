"use client";

import {
  DEFAULT_STUDY_TIMEZONE,
  isValidTimezone,
  normalizeTimezone,
  TIMEZONE_COOKIE_KEY,
  TIMEZONE_STORAGE_KEY,
  TIMEZONE_CHANGED_EVENT,
} from "./study-timezone";

export const TIMEZONE_MODE_STORAGE_KEY = "wordnest.timezone.mode.v1";

export type TimezoneSelectionMode = "device" | "custom";

export interface StoredTimezonePreference {
  mode: TimezoneSelectionMode;
  resolvedTimezone: string;
}

export const DEFAULT_STORED_PREFERENCE: StoredTimezonePreference = {
  mode: "device",
  resolvedTimezone: DEFAULT_STUDY_TIMEZONE,
};

let cachedPreference: StoredTimezonePreference | null = null;

export function subscribeToTimezonePreferences(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TIMEZONE_CHANGED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(TIMEZONE_CHANGED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Gets the device's current IANA timezone via Intl API.
 */
export function getDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(tz) ? tz : DEFAULT_STUDY_TIMEZONE;
  } catch {
    return DEFAULT_STUDY_TIMEZONE;
  }
}

/**
 * Parses cookie string from document.cookie for a specific key.
 */
function getCookieValue(key: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${key.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Sets a cookie with long expiration (1 year), SameSite=Lax, Path=/
 */
function setCookieValue(key: string, value: string): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Reads the client-side timezone preference.
 * Returns a cached object reference to satisfy useSyncExternalStore equality checks.
 */
export function getClientTimezonePreference(): StoredTimezonePreference {
  if (typeof window === "undefined") {
    return DEFAULT_STORED_PREFERENCE;
  }

  const storedMode = (localStorage.getItem(TIMEZONE_MODE_STORAGE_KEY) as TimezoneSelectionMode) || "device";
  let resolvedTimezone = DEFAULT_STUDY_TIMEZONE;
  if (storedMode === "device") {
    resolvedTimezone = getDeviceTimezone();
  } else {
    const storedTz = localStorage.getItem(TIMEZONE_STORAGE_KEY) || getCookieValue(TIMEZONE_COOKIE_KEY);
    resolvedTimezone = normalizeTimezone(storedTz);
  }

  if (
    cachedPreference &&
    cachedPreference.mode === storedMode &&
    cachedPreference.resolvedTimezone === resolvedTimezone
  ) {
    return cachedPreference;
  }

  cachedPreference = { mode: storedMode, resolvedTimezone };
  return cachedPreference;
}

/**
 * Saves the client-side timezone preference, writes to both cookie and localStorage,
 * and notifies listeners.
 */
export function saveClientTimezonePreference(
  mode: TimezoneSelectionMode,
  customTimezone?: string
): StoredTimezonePreference {
  const resolved = mode === "device" ? getDeviceTimezone() : normalizeTimezone(customTimezone);
  cachedPreference = { mode, resolvedTimezone: resolved };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(TIMEZONE_MODE_STORAGE_KEY, mode);
      localStorage.setItem(TIMEZONE_STORAGE_KEY, resolved);
      setCookieValue(TIMEZONE_COOKIE_KEY, resolved);

      window.dispatchEvent(
        new CustomEvent(TIMEZONE_CHANGED_EVENT, {
          detail: { mode, resolvedTimezone: resolved },
        })
      );
    } catch {
      // LocalStorage or cookie may fail in strict private modes
    }
  }

  return cachedPreference;
}
