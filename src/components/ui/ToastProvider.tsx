"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { Toaster, toast as sonnerToast } from "sonner";
import { playUISound } from "@/lib/ui-sound";

export type ToastKind = "success" | "error" | "info";

export type ToastOptions = {
  description?: string;
  duration?: number;
};

export type ToastContextValue = {
  success: (title: string, options?: ToastOptions) => string | number;
  error: (title: string, options?: ToastOptions) => string | number;
  info: (title: string, options?: ToastOptions) => string | number;
  dismiss: (id?: string | number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * WordNest unified toast triggers with tactile audio feedback
 */
export const wnToast = {
  success: (title: string, options?: ToastOptions) => {
    playUISound("success");
    return sonnerToast.success(title, {
      description: options?.description,
      duration: options?.duration ?? 4000,
    });
  },
  error: (title: string, options?: ToastOptions) => {
    playUISound("error");
    return sonnerToast.error(title, {
      description: options?.description,
      duration: options?.duration ?? 5000,
    });
  },
  info: (title: string, options?: ToastOptions) => {
    playUISound("softTap");
    return sonnerToast.info(title, {
      description: options?.description,
      duration: options?.duration ?? 4000,
    });
  },
  dismiss: (id?: string | number) => {
    sonnerToast.dismiss(id);
  },
};

export function ToastProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const success = useCallback((title: string, options?: ToastOptions) => {
    return wnToast.success(title, options);
  }, []);

  const error = useCallback((title: string, options?: ToastOptions) => {
    return wnToast.error(title, options);
  }, []);

  const info = useCallback((title: string, options?: ToastOptions) => {
    return wnToast.info(title, options);
  }, []);

  const dismiss = useCallback((id?: string | number) => {
    wnToast.dismiss(id);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      success,
      error,
      info,
      dismiss,
    }),
    [success, error, info, dismiss]
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            const toasts = node.matches("[data-sonner-toast]")
              ? [node]
              : Array.from(node.querySelectorAll<HTMLElement>("[data-sonner-toast]"));
            for (const toast of toasts) {
              if (!toast.hasAttribute("role")) {
                const type = toast.getAttribute("data-type");
                toast.setAttribute("role", type === "error" ? "alert" : "status");
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        position="top-right"
        gap={8}
        visibleToasts={4}
        closeButton={true}
        mobileOffset={{
          bottom: "calc(env(safe-area-inset-bottom) + 1rem)",
          left: "0.75rem",
          right: "0.75rem",
        }}
        icons={{
          success: (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#DCFCE7] text-[#15803D] shadow-[1px_1px_0px_#221C16]"
              aria-hidden="true"
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={2.75} />
            </span>
          ),
          error: (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FEE2E2] text-[#B91C1C] shadow-[1px_1px_0px_#221C16]"
              aria-hidden="true"
            >
              <CircleAlert className="h-4 w-4" strokeWidth={2.75} />
            </span>
          ),
          info: (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-[#221C16] bg-[#FEF3C7] text-[#B45309] shadow-[1px_1px_0px_#221C16]"
              aria-hidden="true"
            >
              <Info className="h-4 w-4" strokeWidth={2.75} />
            </span>
          ),
          close: <X className="h-3.5 w-3.5" strokeWidth={2.5} />,
        }}
        toastOptions={{
          unstyled: false,
          className: "wn-sonner-toast",
          classNames: {
            toast:
              "wn-toast-card relative flex items-start gap-3 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-3.5 shadow-[4px_4px_0px_#221C16] text-[#221C16]",
            title: "text-sm font-black leading-tight text-[#221C16]",
            description: "mt-1 text-xs font-semibold leading-relaxed text-[#6B6258]",
            closeButton:
              "border-2 border-[#221C16] bg-[#FAF6EE] text-[#6B6258] hover:bg-[#EAE3D2] hover:text-[#221C16] active:translate-y-0.5",
          },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
