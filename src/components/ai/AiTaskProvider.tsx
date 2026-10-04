"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { playUISound } from "@/lib/ui-sound";
import type { AiJobSummary } from "@/services/ai/ai-job-service";

type AiTaskContextValue = {
  activeJobs: AiJobSummary[];
  isGenerating: boolean;
  cancelJob: (jobId: string) => Promise<boolean>;
  refreshJobs: () => Promise<void>;
};

const AiTaskContext = createContext<AiTaskContextValue | null>(null);

const STORAGE_NOTIFIED_KEY = "wordnest.notified_jobs.v1";

function getNotifiedJobIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_NOTIFIED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveNotifiedJobId(id: string) {
  if (typeof window === "undefined") return;
  try {
    const current = getNotifiedJobIds();
    current.add(id);
    sessionStorage.setItem(STORAGE_NOTIFIED_KEY, JSON.stringify(Array.from(current)));
  } catch {}
}

export function AiTaskProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<AiJobSummary[]>([]);
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    notifiedIdsRef.current = getNotifiedJobIds();
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/story-jobs?active=true", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.jobs)) return;

      const fetchedJobs = data.jobs as AiJobSummary[];
      setJobs(fetchedJobs);

      // Check for newly completed or failed jobs
      for (const job of fetchedJobs) {
        if (notifiedIdsRef.current.has(job.id)) continue;

        const isLesson = job.type === "lesson_generation";

        if (job.status === "completed") {
          notifiedIdsRef.current.add(job.id);
          saveNotifiedJobId(job.id);

          playUISound("success");
          toast.success(
            isLesson ? "✨ Bài học AI của bạn đã sẵn sàng" : "✨ Truyện của bạn đã sẵn sàng",
            {
              description: `${job.input?.targetWords?.length || 0} từ · ${job.input?.cefr || "B1"} · ${job.input?.topic || (isLesson ? "Bài học" : "Story")}`,
              duration: 8000,
              action: job.resultUrl
                ? {
                    label: isLesson ? "Xem bài học" : "Xem truyện",
                    onClick: () => {
                      playUISound("softTap");
                      router.push(job.resultUrl!);
                    },
                  }
                : undefined,
            }
          );
        } else if (job.status === "failed") {
          notifiedIdsRef.current.add(job.id);
          saveNotifiedJobId(job.id);

          playUISound("error");
          toast.error(
            isLesson ? "Không thể hoàn tất tạo bài học AI" : "Không thể hoàn tất tạo truyện",
            {
              description: job.errorMessage || "AI gặp lỗi trong quá trình xử lý.",
              duration: 7000,
            }
          );
        }
      }
    } catch (err) {
      console.warn("[AiTaskProvider] Failed to fetch active jobs:", err);
    }
  }, [router]);

  const hasActiveJobs = jobs.some(
    (j) => j.status === "queued" || j.status === "running"
  );

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
        const res = await fetch(`/api/ai/story-jobs/${jobId}/cancel`, {
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

  return (
    <AiTaskContext.Provider
      value={{
        activeJobs: jobs,
        isGenerating: hasActiveJobs,
        cancelJob,
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
