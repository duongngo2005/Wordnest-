"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, RefreshCw, Share2, X } from "lucide-react";
import { isIosDevice, isPwaSecureContext, isSafePwaUpdatePath, isStandalonePwa } from "@/lib/pwa";

const INSTALL_HINT_SEEN_KEY = "wordnest-pwa-install-hint-seen:v1";
const INSTALL_HINT_DISMISSED_KEY = "wordnest-pwa-install-hint-dismissed:v1";
const LEGACY_INSTALL_HINT_DISMISSED_KEY = "wordnest_pwa_prompt_dismissed";
const INSTALL_HINT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

function canShowInstallHint() {
  try {
    if (
      localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) ||
      localStorage.getItem(LEGACY_INSTALL_HINT_DISMISSED_KEY)
    ) {
      return false;
    }

    const lastSeenAt = Number(localStorage.getItem(INSTALL_HINT_SEEN_KEY));
    return !Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt > INSTALL_HINT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function PwaRegister() {
  const pathname = usePathname();
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const updateRequestedRef = useRef(false);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const updateInstallHint = () => {
      const canInstallOnThisDevice =
        isIosDevice(window.navigator.userAgent) &&
        isPwaSecureContext(window) &&
        !isStandalonePwa(window);

      if (!canInstallOnThisDevice || !canShowInstallHint()) return;

      try {
        localStorage.setItem(INSTALL_HINT_SEEN_KEY, String(Date.now()));
      } catch {
        return;
      }
      setShowInstallHint(true);
    };

    updateInstallHint();
    const displayMode = window.matchMedia("(display-mode: standalone)");
    displayMode.addEventListener("change", updateInstallHint);
    return () => displayMode.removeEventListener("change", updateInstallHint);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      void (async () => {
        const registrations = await navigator.serviceWorker?.getRegistrations();
        const cacheNames = "caches" in window ? await caches.keys() : [];
        const wordNestCacheNames = cacheNames.filter((name) => name.startsWith("wordnest-"));

        await Promise.all(registrations?.map((registration) => registration.unregister()) ?? []);
        await Promise.all(wordNestCacheNames.map((name) => caches.delete(name)));
      })();
      return;
    }

    if (!("serviceWorker" in navigator) || !isPwaSecureContext(window)) return;

    let active = true;
    let registration: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;

    const announceWaitingWorker = () => {
      if (active && registration?.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }
    };

    const onUpdateFound = () => {
      installingWorker = registration?.installing ?? null;
      installingWorker?.addEventListener("statechange", () => {
        if (installingWorker?.state === "installed") announceWaitingWorker();
      });
    };

    const onControllerChange = () => {
      if (updateRequestedRef.current) window.location.reload();
    };

    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void registration?.update().catch(() => undefined);
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", updateWhenVisible);

    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registeredWorker) => {
        if (!active) return;
        registration = registeredWorker;
        registrationRef.current = registeredWorker;
        registeredWorker.addEventListener("updatefound", onUpdateFound);
        announceWaitingWorker();
      })
      .catch((error: unknown) => {
        console.error("WordNest service worker registration failed", error);
      });

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", updateWhenVisible);
      registration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  const dismissInstallHint = useCallback(() => {
    setShowInstallHint(false);
    try {
      localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, "true");
    } catch {
      // The hint is optional; private browsing storage failures should not affect learning.
    }
  }, []);

  const applyUpdate = useCallback(() => {
    const waitingWorker = registrationRef.current?.waiting;
    if (!waitingWorker) return;

    updateRequestedRef.current = true;
    setIsUpdating(true);
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const canShowUpdate = updateAvailable && isSafePwaUpdatePath(pathname);

  if (!showInstallHint && !canShowUpdate) return null;

  return (
    <div className="wn-pwa-float-stack" aria-live="polite">
      {canShowUpdate ? (
        <aside className="wn-pwa-float" aria-label="Cập nhật WordNest">
          <div className="flex min-w-0 items-center gap-3">
            <RefreshCw className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <p className="min-w-0 text-sm font-black text-[#221C16]">Có phiên bản WordNest mới</p>
          </div>
          <button
            type="button"
            className="wn-pwa-float__action"
            onClick={applyUpdate}
            disabled={isUpdating}
          >
            {isUpdating ? "Đang cập nhật…" : "Cập nhật"}
          </button>
        </aside>
      ) : null}

      {showInstallHint ? (
        <aside className="wn-pwa-install-hint" aria-label="Cài WordNest lên Màn hình chính">
          <div className="flex min-w-0 items-center gap-3">
            <Download className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-black text-[#221C16]">Thêm WordNest vào Màn hình chính</p>
              <p className="mt-0.5 text-xs font-semibold leading-relaxed text-[#6B6258]">
                Trong Safari: Chia sẻ <Share2 className="inline h-3.5 w-3.5" aria-hidden="true" /> → Thêm vào MH chính.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissInstallHint}
            className="wn-pwa-float__close"
            aria-label="Ẩn hướng dẫn cài WordNest"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </aside>
      ) : null}
    </div>
  );
}
