"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronRight, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useAiTasks } from "./AiTaskProvider";
import { playUISound } from "@/lib/ui-sound";
import type { AiJobStage, AiJobStatus, AiJobSummary } from "@/services/ai/ai-job-service";

function getStageLabel(stage: AiJobStage, status: AiJobStatus, queuePosition?: number): string {
  if (status === "queued") return typeof queuePosition === "number" ? `Đang chờ · #${queuePosition}` : "Đang chờ";
  if (status === "retry_pending") return "Đang chờ thử lại an toàn";
  if (status === "cancelled") return "Đã hủy";
  if (status === "failed") return "Thất bại";
  if (status === "interrupted") return "Bị gián đoạn";
  if (status === "completed") return "Đã hoàn tất";
  switch (stage) {
    case "generating_story": return "Đang viết truyện";
    case "generating_lesson": return "Đang tạo bài học AI";
    case "validating_vocabulary": return "Đang kiểm tra từ vựng";
    case "repairing_story": return "Đang tinh chỉnh truyện";
    case "repairing_lesson": return "Đang tinh chỉnh bài học";
    case "generating_translations": return "Đang dịch nghĩa ngữ cảnh";
    case "generating_narration": return "Đang tạo giọng đọc";
    case "saving": return "Đang lưu kết quả";
    case "cancel_requested": return "Đang gửi yêu cầu hủy";
    default: return "Đang xử lý";
  }
}

function jobTitle(job: AiJobSummary): string {
  const input = job.input as { targetWords?: string[]; cefr?: string; topic?: string };
  const kind = job.type === "lesson_generation" ? "Bài học AI" : "Truyện";
  return `${kind} · ${input.cefr || "B1"} · ${input.targetWords?.length || 0} từ${input.topic ? ` · ${input.topic}` : ""}`;
}

export function AiTaskIndicator() {
  const { activeJobs, isGenerating, queueCounts, cancelJob, retryJob } = useAiTasks();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  if (activeJobs.length === 0) return null;
  const runningCount = queueCounts.running;
  const queuedCount = queueCounts.queued;

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => { playUISound("softTap"); setIsOpen((current) => !current); }}
        aria-label="Tác vụ AI"
        aria-expanded={isOpen}
        aria-controls="ai-task-panel"
        className={`wn-nav-link flex items-center gap-1.5 rounded-xl border-2 border-[#221C16] px-2.5 py-1.5 text-xs font-extrabold shadow-[2px_2px_0px_#221C16] transition-transform active:translate-y-0.5 sm:text-sm ${isGenerating ? "bg-[#FEF3C7] text-[#92400E]" : "bg-[#F0FDF4] text-[#166534]"}`}
      >
        {isGenerating ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#D97706]" strokeWidth={2.5} /> : <Sparkles className="h-4 w-4 shrink-0 text-[#16A34A]" strokeWidth={2.5} />}
        <span className="whitespace-nowrap">AI: {runningCount} đang chạy · {queuedCount} đang chờ</span>
      </button>

      {isOpen ? (
        <section id="ai-task-panel" aria-label="Danh sách tác vụ AI" className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border-2 border-[#221C16] bg-[#FFFDF9] p-3.5 shadow-[4px_4px_0px_#221C16] sm:w-96">
          <div className="mb-2.5 flex items-center justify-between border-b border-[#E5E0D5] pb-2">
            <div className="flex items-center gap-1.5 text-sm font-black text-[#221C16]"><Sparkles className="h-4 w-4 text-[var(--accent)]" /><span>Tác vụ AI nền</span></div>
            <button type="button" onClick={() => setIsOpen(false)} className="p-1 text-[#6B6258] hover:text-[#221C16]" aria-label="Đóng"><X className="h-4 w-4" /></button>
          </div>

          <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1" aria-live="polite">
            {activeJobs.map((job) => {
              const pending = job.status === "running" || job.status === "queued" || job.status === "retry_pending";
              const failed = job.status === "failed" || job.status === "interrupted";
              return (
                <div key={job.id} className="rounded-xl border border-[#E5E0D5] bg-[#FAF6EE] p-2.5 text-xs text-[#221C16]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{jobTitle(job)}</p>
                      <p className="mt-0.5 text-[11px] text-[#6B6258]">{getStageLabel(job.stage, job.status, job.queuePosition)}</p>
                    </div>
                    {job.status === "completed" && job.resultUrl ? (
                      <Link href={job.resultUrl} onClick={() => setIsOpen(false)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#221C16] bg-[#221C16] px-2 py-1 text-[11px] font-bold text-[#FFFDF9] hover:bg-[#3D352E]">
                        <span>Mở</span><ChevronRight className="h-3 w-3" />
                      </Link>
                    ) : pending ? (
                      <button type="button" onClick={() => cancelJob(job.id)} className="shrink-0 rounded-lg border border-[#E5E0D5] bg-[#FFFDF9] px-2 py-1 text-[11px] font-semibold text-[#B91C1C] hover:bg-[#FEE2E2]">Hủy</button>
                    ) : failed ? (
                      <button type="button" onClick={() => retryJob(job.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#B91C1C] bg-[#FFFDF9] px-2 py-1 text-[11px] font-bold text-[#B91C1C] hover:bg-[#FEE2E2]"><RotateCcw className="h-3 w-3" />Thử lại</button>
                    ) : job.status === "cancelled" ? <AlertCircle className="h-4 w-4 shrink-0 text-[#6B6258]" /> : null}
                  </div>
                  {failed && job.errorMessage ? <p className="mt-2 text-[11px] font-medium text-[#B91C1C]">{job.errorMessage}</p> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
