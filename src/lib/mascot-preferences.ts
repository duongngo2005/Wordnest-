export const MASCOT_PREFERENCE_STORAGE_KEY = "wordnest.mascot.v1";
export const MASCOT_PREFERENCE_CHANGED_EVENT = "wordnest:mascot-changed";

export const MASCOT_IDS = ["nesty", "dino", "knight"] as const;
export type MascotId = (typeof MASCOT_IDS)[number];

export const DEFAULT_MASCOT_ID: MascotId = "nesty";

let cachedMascotId: MascotId = DEFAULT_MASCOT_ID;
let cachedStorageValue: string | null | undefined;

export function parseMascotId(value: string | null): MascotId {
  return value === "nesty" || value === "dino" || value === "knight" ? value : DEFAULT_MASCOT_ID;
}

export function getMascotId(): MascotId {
  if (typeof window === "undefined") return DEFAULT_MASCOT_ID;

  try {
    const storedValue = window.localStorage.getItem(MASCOT_PREFERENCE_STORAGE_KEY);
    if (storedValue !== cachedStorageValue) {
      cachedStorageValue = storedValue;
      cachedMascotId = parseMascotId(storedValue);
    }
  } catch {
    // Storage can be unavailable in private browsing or restrictive environments.
  }

  return cachedMascotId;
}

export function saveMascotId(mascotId: MascotId): boolean {
  if (typeof window === "undefined") return false;

  cachedStorageValue = mascotId;
  cachedMascotId = mascotId;

  let wasPersisted = true;

  try {
    window.localStorage.setItem(MASCOT_PREFERENCE_STORAGE_KEY, mascotId);
  } catch {
    // Keep this tab usable even when persistence is unavailable.
    wasPersisted = false;
  }

  window.dispatchEvent(new Event(MASCOT_PREFERENCE_CHANGED_EVENT));
  return wasPersisted;
}

export function subscribeToMascotId(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === MASCOT_PREFERENCE_STORAGE_KEY) onStoreChange();
  };

  window.addEventListener(MASCOT_PREFERENCE_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(MASCOT_PREFERENCE_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}
