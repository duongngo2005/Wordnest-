"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Loader2, AlertCircle, X, ChevronRight } from "lucide-react";
import { useAiTasks } from "./AiTaskProvider";
import { playUISound } from "@/lib/ui-sound";
import type { AiJobStage, AiJobStatus } from "@/services/ai/ai-job-service";

function getStageLabel(stage: AiJobStage, status: AiJobStatus, queuePosition?: number): string {
  if (status === "queued") {
    if (typeof queuePosition === "number" && queuePosition > 1) {
      return `Tác vụ thứ ${queuePosition} trong hàng đợi`;
    }
    return "Đang chờ trong hàng đợi...";
  }
  if (status === "cancelled") return "Đã hủy";
  if (status === "failed") return "Thất bại";
  if (status === "interrupted") return "Bị gián đoạn";
  if (status === "completed") return "Đã hoàn tất";

  switch (stage) {
    case "generating_story":
      return "Đang viết truyện...";
    case "generating_lesson":
      return "Đang tạo bài học AI...";
    case "validating_vocabulary":
      return "Đang kiểm tra từ vựng...";
    case "repairing_story":
      return "Đang tinh chỉnh truyện...";
    case "repairing_lesson":
      return "Đang tinh chỉnh bài học...";
    case "generating_translations":
      return "Đang dịch nghĩa ngữ cảnh...";
    case "generating_narration":
      return "Đang nạp giọng đọc cho toàn bài...";
    case "saving":
      return "Đang lưu vào kho từ...";
    default:
      return "Đang xử lý...";
  }
}

export function AiTaskIndicator() {
  const { activeJobs, isGenerating, cancelJob } = useAiTasks();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (activeJobs.length === 0) {
    return null;
  }

  const runningCount = activeJobs.filter(
    (j) => j.status === "queued" || j.status === "running"
  ).length;

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          playUISound("softTap");
          setIsOpen((prev) => !prev);
        }}
        aria-label="Tác vụ AI"
        aria-expanded={isOpen}
        className={`wn-nav-link flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-extrabold rounded-xl border-2 border-[#221C16] shadow-[2px_2px_0px_#221C16] transition-transform active:translate-y-0.5 ${
          isGenerating
            ? "bg-[#FEF3C7] text-[#92400E]"
            : "bg-[#F0FDF4] text-[#166534]"
        }`}
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#D97706]" strokeWidth={2.5} />
        ) : (
          <Sparkles className="h-4 w-4 shrink-0 text-[#16A34A]" strokeWidth={2.5} />
        )}
        <span className="whitespace-nowrap">
          AI {runningCount > 0 ? `· ${runningCount}` : ""}
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Danh sách tác vụ AI"
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-3.5 shadow-[4px_4px_0px_#221C16] z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between border-b border-[#E5E0D5] pb-2 mb-2.5">
            <div className="flex items-center gap-1.5 text-sm font-black text-[#221C16]">
              <Sparkles className="h-4 w-4 text-[var(--accent)]" />
              <span>Tác vụ AI nền</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[#6B6258] hover:text-[#221C16] p-1"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {activeJobs.map((job) => {
              const isRunning = job.status === "running";
              const isQueued = job.status === "queued";
              const isDone = job.status === "completed";
              const isFailed = job.status === "failed" || job.status === "interrupted";

              return (
                <div
                  key={job.id}
                  className="rounded-xl border border-[#E5E0D5] bg-[#FAF6EE] p-2.5 text-xs text-[#221C16]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">
                        {job.type === "lesson_generation" ? "Bài học AI" : "Truyện"}{" "}
                        {job.input?.cefr} · {job.input?.targetWords?.length || 0} từ · {job.input?.topic || ""}
                      </p>
                      <p className="text-[11px] text-[#6B6258] mt-0.5">
                        {getStageLabel(job.stage, job.status, job.queuePosition)}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isDone && job.resultUrl ? (
                        <Link
                          href={job.resultUrl}
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#221C16] bg-[#221C16] px-2 py-1 text-[11px] font-bold text-[#FFFDF9] hover:bg-[#3D352E]"
                        >
                          <span>Xem</span>
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      ) : isRunning || isQueued ? (
                        <button
                          type="button"
                          onClick={() => cancelJob(job.id)}
                          className="rounded-lg border border-[#E5E0D5] bg-[#FFFDF9] px-2 py-1 text-[11px] font-semibold text-[#B91C1C] hover:bg-[#FEE2E2]"
                        >
                          Hủy
                        </button>
                      ) : isFailed ? (
                        <span className="inline-flex items-center text-[#B91C1C]">
                          <AlertCircle className="h-4 w-4" />
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {(isRunning || isQueued) && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E0D5]">
                      <div
                        className="h-full bg-[var(--accent)] transition-all duration-300"
                        style={{ width: `${Math.max(job.progress, 5)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
