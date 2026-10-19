"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";
import { playUISound } from "@/lib/ui-sound";
import type { AiJobSummary } from "@/services/ai/ai-job-service";

type AiTaskContextValue = {
  activeJobs: AiJobSummary[];
  isGenerating: boolean;
  queueCounts: { running: number; queued: number };
  cancelJob: (jobId: string) => Promise<boolean>;
  retryJob: (jobId: string) => Promise<boolean>;
  refreshJobs: () => Promise<void>;
};

const AiTaskContext = createContext<AiTaskContextValue | null>(null);

export function AiTaskProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<AiJobSummary[]>([]);
  const [queueCounts, setQueueCounts] = useState({ running: 0, queued: 0 });

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/story-jobs?active=true", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.jobs)) return;

      const fetchedJobs = data.jobs as AiJobSummary[];
      setJobs(fetchedJobs);
      if (data.counts && typeof data.counts.running === "number" && typeof data.counts.queued === "number") {
        setQueueCounts({ running: data.counts.running, queued: data.counts.queued });
      }

    } catch (err) {
      console.warn("[AiTaskProvider] Failed to fetch active jobs:", err);
    }
  }, []);

  const hasActiveJobs = queueCounts.running > 0 || queueCounts.queued > 0;

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    const tick = async () => {
      if (document.visibilityState !== "hidden" && !cancelled) {
        await refreshJobs();
      }
      if (!cancelled) {
        timer = setTimeout(tick, hasActiveJobs ? 2500 : 15000);
      }
    };

    timer = setTimeout(tick, 0);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshJobs();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasActiveJobs, refreshJobs]);

  const cancelJob = useCallback(
    async (jobId: string) => {
      try {
        const endpoint = `/api/ai/story-jobs/${jobId}/cancel`;
        const res = await fetch(endpoint, {
          method: "POST",
        });
        const data = await res.json();
        if (data.success) {
          playUISound("softTap");
          toast.info("Đã gửi yêu cầu hủy tác vụ.");
          await refreshJobs();
          return true;
        }
        return false;
      } catch {
        toast.error("Không thể hủy tác vụ lúc này.");
        return false;
      }
    },
    [refreshJobs]
  );

  const retryJob = useCallback(
    async (jobId: string) => {
      try {
        const endpoint = `/api/ai/story-jobs/${jobId}/retry`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        });
        const data = await res.json();
        if (!data.success) return false;
        toast.success("Đã đưa tác vụ AI vào hàng đợi.");
        await refreshJobs();
        return true;
      } catch {
        toast.error("Không thể thử lại tác vụ lúc này.");
        return false;
      }
    },
    [refreshJobs]
  );

  return (
    <AiTaskContext.Provider
      value={{
        activeJobs: jobs,
        isGenerating: hasActiveJobs,
        queueCounts,
        cancelJob,
        retryJob,
        refreshJobs,
      }}
    >
      {children}
    </AiTaskContext.Provider>
  );
}

export function useAiTasks() {
  const context = useContext(AiTaskContext);
  if (!context) {
    throw new Error("useAiTasks must be used within an AiTaskProvider");
  }
  return context;
}
