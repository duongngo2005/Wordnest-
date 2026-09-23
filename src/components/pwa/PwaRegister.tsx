"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Share2, PlusSquare, X } from "lucide-react";

const subscribeToNothing = () => () => {};
const WORDNEST_CACHE_PREFIX = "wordnest-cache-";

function shouldShowIosPrompt() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
  const isStandalone =
    ("standalone" in window.navigator &&
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)) ||
    window.matchMedia("(display-mode: standalone)").matches;

  return (
    isIosDevice &&
    !isStandalone &&
    !localStorage.getItem("wordnest_pwa_prompt_dismissed")
  );
}

export function PwaRegister() {
  const [isDismissed, setIsDismissed] = useState(false);
  const canShowIosPrompt = useSyncExternalStore(
    subscribeToNothing,
    shouldShowIosPrompt,
    () => false
  );
  const showIosPrompt = canShowIosPrompt && !isDismissed;

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.location.protocol.startsWith("http")) {
      return;
    }

    if (process.env.NODE_ENV === "development") {
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const cacheNames = "caches" in window ? await caches.keys() : [];
        const wordNestCacheNames = cacheNames.filter((name) => name.startsWith(WORDNEST_CACHE_PREFIX));

        await Promise.all(registrations.map((registration) => registration.unregister()));
        await Promise.all(wordNestCacheNames.map((name) => caches.delete(name)));

        if (registrations.length > 0 || wordNestCacheNames.length > 0) {
          window.location.reload();
        }
      })();
      return;
    }

    // Service workers are a production-only concern. Caching dev chunks can keep
    // a LAN or tunnel tab on stale client code after a local change.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          console.log("[PWA] ServiceWorker registered with scope:", reg.scope);
        })
        .catch((err) => {
          console.warn("[PWA] ServiceWorker registration failed:", err);
        });
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("wordnest_pwa_prompt_dismissed", "true");
  };

  if (!showIosPrompt) {
    return null;
  }

  return (
    <aside
      aria-label="Hướng dẫn cài đặt ứng dụng"
      className="fixed bottom-3 inset-x-3 sm:max-w-md sm:left-auto sm:right-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="bg-[#FFFDF9] border-[2.5px] border-[#221C16] shadow-[4px_4px_0px_#221C16] rounded-2xl p-4 text-[#221C16]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#221C16] border-[2px] border-[#E06B43] flex items-center justify-center text-[#FAF6EE] font-black text-xl shadow-sm flex-shrink-0">
              W
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight">Cài WordNest lên iPhone</h2>
              <p className="text-xs text-[#6B6258] mt-0.5">
                Dùng như app toàn màn hình, học mượt hơn
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg text-[#6B6258] hover:text-[#221C16] hover:bg-[#F2ECE1] transition-colors"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-[#EFE8DA] text-xs space-y-2 text-[#443C34]">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#FAF6EE] border border-[#221C16] flex items-center justify-center font-bold text-[11px] flex-shrink-0">
              1
            </span>
            <span>
              Bấm nút <strong>Chia sẻ (Share)</strong>{" "}
              <Share2 className="w-3.5 h-3.5 inline text-[#E06B43] stroke-[2.5]" /> ở thanh công cụ Safari.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#FAF6EE] border border-[#221C16] flex items-center justify-center font-bold text-[11px] flex-shrink-0">
              2
            </span>
            <span>
              Cuộn xuống và chọn{" "}
              <strong>Thêm vào MH chính (Add to Home Screen)</strong>{" "}
              <PlusSquare className="w-3.5 h-3.5 inline text-[#0D9488] stroke-[2.5]" />.
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
