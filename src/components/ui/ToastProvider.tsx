"use client";

import {
  CheckCircle2,
  CircleAlert,
  Info,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastKind = "success" | "error" | "info";

type ToastOptions = {
  description?: string;
  duration?: number;
};

type ToastItem = ToastOptions & {
  id: number;
  kind: ToastKind;
  title: string;
};

type ToastContextValue = {
  success: (title: string, options?: ToastOptions) => number;
  error: (title: string, options?: ToastOptions) => number;
  info: (title: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const MAX_VISIBLE_TOASTS = 4;
const DEFAULT_DURATION = 4_800;

const toastStyles: Record<
  ToastKind,
  { Icon: typeof CheckCircle2; icon: string; accent: string; label: string }
> = {
  success: {
    Icon: CheckCircle2,
    icon: "bg-[#DCFCE7] text-[#15803D]",
    accent: "bg-[#16A34A]",
    label: "Thành công",
  },
  error: {
    Icon: CircleAlert,
    icon: "bg-[#FEE2E2] text-[#B91C1C]",
    accent: "bg-[#DC2626]",
    label: "Có lỗi",
  },
  info: {
    Icon: Info,
    icon: "bg-[#FEF3C7] text-[#B45309]",
    accent: "bg-[#E06B43]",
    label: "Thông báo",
  },
};

export function ToastProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, title: string, options: ToastOptions = {}) => {
      const id = ++nextId.current;
      const toast: ToastItem = {
        id,
        kind,
        title,
        description: options.description,
        duration: options.duration,
      };

      setToasts((current) => [...current, toast].slice(-MAX_VISIBLE_TOASTS));

      const duration = options.duration ?? DEFAULT_DURATION;
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration));
      }
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (title, options) => show("success", title, options),
      error: (title, options) => show("error", title, options),
      info: (title, options) => show("info", title, options),
      dismiss,
    }),
    [dismiss, show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[100] flex max-w-md flex-col gap-2 sm:inset-x-auto sm:right-5 sm:top-[calc(env(safe-area-inset-top)+1rem)] sm:bottom-auto sm:w-[min(24rem,calc(100vw-2rem))]"
        aria-label="Thông báo"
      >
        {toasts.map((toast) => {
          const style = toastStyles[toast.kind];
          const Icon = style.Icon;

          return (
            <div
              key={toast.id}
              className="toast-enter pointer-events-auto relative overflow-hidden rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-3.5 pr-11 shadow-[4px_4px_0px_#221C16]"
              role={toast.kind === "error" ? "alert" : "status"}
            >
              <span className={`absolute inset-y-0 left-0 w-1.5 ${style.accent}`} aria-hidden="true" />
              <div className="flex items-start gap-3 pl-1">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#221C16] ${style.icon}`} aria-hidden="true">
                  <Icon className="h-4 w-4" strokeWidth={2.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black leading-tight text-[#221C16]">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-[#6B6258]">{toast.description}</p>
                  )}
                  <span className="sr-only">{style.label}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="absolute right-2 top-2 rounded-lg p-1.5 text-[#6B6258] transition-colors hover:bg-[#EAE3D2] hover:text-[#221C16] focus:outline-none focus:ring-2 focus:ring-[#E06B43]"
                aria-label={`Đóng thông báo: ${toast.title}`}
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
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
