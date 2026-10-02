"use client";

import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_MASCOT_ID,
  getMascotId,
  subscribeToMascotId,
  type MascotId,
} from "@/lib/mascot-preferences";

function applyMascotTheme(mascotId: MascotId) {
  document.documentElement.dataset.mascotTheme = mascotId;
}

export function MascotThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const mascotId = useSyncExternalStore(subscribeToMascotId, getMascotId, () => DEFAULT_MASCOT_ID);

  useEffect(() => {
    applyMascotTheme(mascotId);
  }, [mascotId]);

  return children;
}
