"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const REPORT_INTERVAL_MS = 60_000;
const IDLE_AFTER_MS = 120_000;
const MAX_UNINTERRUPTED_INTERVAL_MS = 60_000;

function reportActiveSeconds(seconds: number, useBeacon: boolean): Promise<boolean> {
  if (!Number.isFinite(seconds) || seconds < 1) return Promise.resolve(false);

  const body = JSON.stringify({ seconds });
  if (useBeacon && "sendBeacon" in navigator) {
    const payload = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/activity/online", payload)) return Promise.resolve(true);
  }

  return fetch("/api/activity/online", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  })
    .then((response) => response.ok)
    .catch(() => false);
}

/**
 * Tracks only foreground WordNest time with recent user interaction. It is
 * intentionally global and silent: a usage context signal, never learning evidence.
 */
export function OnlineActivityTracker() {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let visible = document.visibilityState === "visible";
    let focused = document.hasFocus();
    let lastMeasuredAt = Date.now();
    let lastInteractionAt = lastMeasuredAt;
    let pendingMilliseconds = 0;

    const recordElapsedTime = (now = Date.now()) => {
      const latestActiveMoment = Math.min(
        now,
        lastMeasuredAt + MAX_UNINTERRUPTED_INTERVAL_MS,
        lastInteractionAt + IDLE_AFTER_MS
      );
      if (visible && focused && latestActiveMoment > lastMeasuredAt) {
        pendingMilliseconds += latestActiveMoment - lastMeasuredAt;
      }
      lastMeasuredAt = now;
    };

    const flush = (useBeacon = false) => {
      const seconds = Math.floor(pendingMilliseconds / 1_000);
      if (seconds < 1) return;
      pendingMilliseconds -= seconds * 1_000;
      const report = reportActiveSeconds(seconds, useBeacon);
      if (!useBeacon) {
        void report.then((recorded) => {
          if (recorded && pathnameRef.current === "/progress") router.refresh();
        });
      }
    };

    const recordInteraction = () => {
      recordElapsedTime();
      lastInteractionAt = Date.now();
    };
    const onVisibilityChange = () => {
      recordElapsedTime();
      visible = document.visibilityState === "visible";
      lastMeasuredAt = Date.now();
      if (visible) lastInteractionAt = lastMeasuredAt;
      if (!visible) flush(true);
    };
    const onFocus = () => {
      lastMeasuredAt = Date.now();
      focused = true;
      lastInteractionAt = lastMeasuredAt;
    };
    const onBlur = () => {
      recordElapsedTime();
      focused = false;
      flush(true);
    };
    const onPageHide = () => {
      recordElapsedTime();
      flush(true);
    };
    const timer = window.setInterval(() => {
      recordElapsedTime();
      flush();
    }, REPORT_INTERVAL_MS);

    const activityEvents: Array<keyof WindowEventMap> = ["keydown", "pointerdown", "scroll", "touchstart"];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, recordInteraction, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(timer);
      recordElapsedTime();
      flush(true);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, recordInteraction);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
