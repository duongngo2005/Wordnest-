/**
 * UI Sound Preferences for WordNest
 *
 * Stores user preferences for tactile interface sounds (enable/disable, volume)
 * in localStorage using a reactive subscriber pattern compatible with useSyncExternalStore.
 */

export const UI_SOUND_STORAGE_KEY = "wordnest.ui-sound.v1";
export const UI_SOUND_CHANGED_EVENT = "wordnest:ui-sound-changed";

export type UISoundPreferences = {
  enabled: boolean;
  volume: number; // 0.0 to 1.0 (default: 0.2 for gentle, non-intrusive feedback)
};

export const DEFAULT_UI_SOUND_PREFERENCES: UISoundPreferences = {
  enabled: true,
  volume: 0.2,
};

let cachedPreferences: UISoundPreferences = DEFAULT_UI_SOUND_PREFERENCES;
let cachedStorageValue: string | null | undefined;

export function parseUISoundPreferences(value: string | null): UISoundPreferences {
  if (!value) return DEFAULT_UI_SOUND_PREFERENCES;

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_UI_SOUND_PREFERENCES;
    }

    const enabled = typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_UI_SOUND_PREFERENCES.enabled;
    const volume =
      typeof parsed.volume === "number" && parsed.volume >= 0 && parsed.volume <= 1
        ? parsed.volume
        : DEFAULT_UI_SOUND_PREFERENCES.volume;

    return { enabled, volume };
  } catch {
    return DEFAULT_UI_SOUND_PREFERENCES;
  }
}

export function getUISoundPreferences(): UISoundPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_UI_SOUND_PREFERENCES;
  }

  try {
    const stored = window.localStorage.getItem(UI_SOUND_STORAGE_KEY);
    if (stored !== cachedStorageValue) {
      cachedStorageValue = stored;
      cachedPreferences = parseUISoundPreferences(stored);
    }
    return cachedPreferences;
  } catch {
    return cachedPreferences;
  }
}

export function saveUISoundPreferences(preferences: UISoundPreferences): void {
  if (typeof window === "undefined") return;

  const serialized = JSON.stringify(preferences);
  cachedStorageValue = serialized;
  cachedPreferences = preferences;

  try {
    window.localStorage.setItem(UI_SOUND_STORAGE_KEY, serialized);
  } catch {
    // Graceful fallback if storage is restricted
  }

  window.dispatchEvent(new Event(UI_SOUND_CHANGED_EVENT));
}

export function subscribeToUISoundPreferences(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === UI_SOUND_STORAGE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener(UI_SOUND_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(UI_SOUND_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}
