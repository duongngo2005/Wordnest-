import { db } from "@/lib/db";
import { executeStoryPipeline } from "./story-pipeline";
import {
  type StoryCefr,
  type StoryLength,
  type StoryTopic,
} from "@/lib/validation/story";
import { AICancelledError, AITimeoutError, AIOomError } from "./ai-core";
import { AI_CONFIG } from "./ai-config";
import type { CloudTtsVoiceId } from "@/lib/tts/voice-catalog";

export type AiJobType = "story_generation" | "lesson_generation";
export type AiJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type AiJobStage =
  | "queued"
  | "generating_story"
  | "generating_lesson"
  | "validating_vocabulary"
  | "repairing_story"
  | "repairing_lesson"
  | "generating_translations"
  | "generating_narration"
  | "saving"
  | "completed";

export type StoryJobInput = {
  deckId: string;
  targetWords: string[];
  cefr: StoryCefr;
  length: StoryLength;
  topic: StoryTopic;
  narrationVoiceId?: CloudTtsVoiceId;
};

export type LessonJobInput = {
  deckId: string;
  targetWords: string[];
  cefr?: StoryCefr;
  topic?: string;
};

export type AiJobSummary = {
  id: string;
  type: string;
  status: AiJobStatus;
  stage: AiJobStage;
  progress: number;
  input: StoryJobInput | LessonJobInput;
  resultId: string | null;
  resultUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  queuePosition?: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

class AiJobQueueManager {
  private activeJobId: string | null = null;
  private activeAbortController: AbortController | null = null;
  private memoryQueue: string[] = []; // Job IDs queued in order
  private isProcessing = false;
  private hasRecoveredOnStartup = false;

  constructor() {
    // Non-blocking initialization
    if (typeof window === "undefined") {
      this.recoverInterruptedJobs().catch(console.error);
    }
  }

  private async recoverInterruptedJobs() {
    if (this.hasRecoveredOnStartup) return;
    this.hasRecoveredOnStartup = true;

    try {
      // Mark any orphaned running jobs as interrupted
      await db.aiJob.updateMany({
        where: { status: "running" },
        data: {
          status: "interrupted",
          errorCode: "AI_JOB_INTERRUPTED",
          errorMessage: "Tiến trình bị gián đoạn do máy chủ khởi động lại.",
          completedAt: new Date(),
        },
      });

      // Find any previously queued jobs and load into memory queue
      const existingQueued = await db.aiJob.findMany({
        where: { status: "queued" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      for (const item of existingQueued) {
        if (!this.memoryQueue.includes(item.id)) {
          this.memoryQueue.push(item.id);
        }
      }

      this.processNext();
    } catch (err) {
      console.warn("[AiJobQueue] Failed to recover stale jobs:", err);
    }
  }

  /**
   * Enqueues a new story generation job. Returns created job immediately.
   */
  async createStoryJob(input: StoryJobInput): Promise<AiJobSummary> {
    await this.recoverInterruptedJobs();

    const job = await db.aiJob.create({
      data: {
        type: "story_generation",
        status: "queued",
        stage: "queued",
        progress: 0,
        input,
      },
    });

    this.memoryQueue.push(job.id);
    this.processNext();

    const position = this.getQueuePosition(job.id);
    return this.serializeJob(job, position);
  }

  /**
   * Enqueues a new AI lesson generation job. Returns created job immediately.
   */
  async createLessonJob(input: LessonJobInput): Promise<AiJobSummary> {
    await this.recoverInterruptedJobs();

    const job = await db.aiJob.create({
      data: {
        type: "lesson_generation",
        status: "queued",
        stage: "queued",
        progress: 0,
        input,
      },
    });

    this.memoryQueue.push(job.id);
    this.processNext();

    const position = this.getQueuePosition(job.id);
    return this.serializeJob(job, position);
  }

  getQueuePosition(jobId: string): number | undefined {
    if (this.activeJobId === jobId) return 0; // Currently running
    const idx = this.memoryQueue.indexOf(jobId);
    if (idx >= 0) return idx + 1; // 1-based queue position
    return undefined;
  }

  async getJob(jobId: string): Promise<AiJobSummary | null> {
    const job = await db.aiJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    const position = this.getQueuePosition(job.id);
    return this.serializeJob(job, position);
  }

  async getActiveAndRecentJobs(): Promise<AiJobSummary[]> {
    await this.recoverInterruptedJobs();
    this.processNext().catch(() => {});

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const jobs = await db.aiJob.findMany({
      where: {
        OR: [
          { status: { in: ["queued", "running"] } },
          { completedAt: { gte: fiveMinutesAgo } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return jobs.map((j) => this.serializeJob(j, this.getQueuePosition(j.id)));
  }

  async cancelJob(jobId: string): Promise<{ success: boolean; message: string }> {
    // If running, abort active signal
    if (this.activeJobId === jobId && this.activeAbortController) {
      this.activeAbortController.abort();
      await db.aiJob.update({
        where: { id: jobId },
        data: {
          status: "cancelled",
          errorCode: "AI_CANCELLED",
          errorMessage: "Tác vụ đã bị người dùng hủy.",
          completedAt: new Date(),
        },
      });
      return { success: true, message: "Đã hủy tác vụ đang xử lý." };
    }

    // If in memory queue, remove
    const queueIdx = this.memoryQueue.indexOf(jobId);
    if (queueIdx >= 0) {
      this.memoryQueue.splice(queueIdx, 1);
    }

    await db.aiJob.updateMany({
      where: { id: jobId, status: { in: ["queued", "running"] } },
      data: {
        status: "cancelled",
        errorCode: "AI_CANCELLED",
        errorMessage: "Tác vụ đã bị hủy.",
        completedAt: new Date(),
      },
    });

    return { success: true, message: "Đã hủy tác vụ trong hàng đợi." };
  }

  private async processNext() {
    if (this.isProcessing) return;

    const job = await db.aiJob.findFirst({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });

    if (!job) return;

    this.isProcessing = true;
    const jobId = job.id;
    this.activeJobId = jobId;
    this.activeAbortController = new AbortController();

    try {
      const isLesson = job.type === "lesson_generation";

      await db.aiJob.update({
        where: { id: jobId },
        data: {
          status: "running",
          stage: isLesson ? "generating_lesson" : "generating_story",
          progress: 10,
          startedAt: new Date(),
        },
      });

      // Overall job timeout timer
      const timeoutTimer = setTimeout(() => {
        if (this.activeJobId === jobId && this.activeAbortController) {
          this.activeAbortController.abort();
        }
      }, AI_CONFIG.job.maxDurationMs);

      try {
        if (isLesson) {
          const input = job.input as LessonJobInput;
          const { lessonService } = await import("@/services/vocabulary/lesson-service");
          const lesson = await lessonService.createLesson({
            deckId: input.deckId,
            targetWords: input.targetWords,
            cefr: input.cefr,
            topic: input.topic,
            signal: this.activeAbortController.signal,
            onStageChange: async (stage, progress) => {
              await db.aiJob.update({
                where: { id: jobId },
                data: { stage, progress },
              });
            },
          });

          clearTimeout(timeoutTimer);

          const resultUrl = `/decks/${input.deckId}/lesson?lessonId=${lesson.id}`;

          await db.aiJob.update({
            where: { id: jobId },
            data: {
              status: "completed",
              stage: "completed",
              progress: 100,
              resultId: lesson.id,
              resultUrl,
              completedAt: new Date(),
            },
          });
        } else {
          const input = job.input as StoryJobInput;
          const result = await executeStoryPipeline({
            deckId: input.deckId,
            targetWords: input.targetWords,
            cefr: input.cefr,
            length: input.length,
            topic: input.topic,
            narrationVoiceId: input.narrationVoiceId,
            signal: this.activeAbortController.signal,
            onStageChange: async (stage, progress) => {
              await db.aiJob.update({
                where: { id: jobId },
                data: { stage, progress },
              });
            },
          });

          clearTimeout(timeoutTimer);

          const resultUrl = `/decks/${input.deckId}/story?storyId=${result.story.id}`;

          await db.aiJob.update({
            where: { id: jobId },
            data: {
              status: "completed",
              stage: "completed",
              progress: 100,
              resultId: result.story.id,
              resultUrl,
              completedAt: new Date(),
            },
          });
        }
      } catch (pipelineErr) {
        clearTimeout(timeoutTimer);
        throw pipelineErr;
      }
    } catch (err: unknown) {
      const isCancelled =
        err instanceof AICancelledError || this.activeAbortController?.signal.aborted;
      const isTimeout = err instanceof AITimeoutError;
      const isOom = err instanceof AIOomError;

      let errorCode = "AI_UNKNOWN_ERROR";
      let errorMessage =
        job.type === "lesson_generation"
          ? "Không thể hoàn tất tạo bài học do lỗi không xác định."
          : "Không thể hoàn tất tạo truyện do lỗi không xác định.";

      if (isCancelled) {
        errorCode = "AI_CANCELLED";
        errorMessage = "Tác vụ đã bị người dùng hủy.";
      } else if (isTimeout) {
        errorCode = "AI_TIMEOUT";
        errorMessage =
          job.type === "lesson_generation"
            ? "AI mất quá nhiều thời gian để hoàn tất bài học (quá giới hạn xử lý)."
            : "AI mất quá nhiều thời gian để hoàn tất truyện (quá giới hạn xử lý).";
      } else if (isOom) {
        errorCode = "AI_OUT_OF_MEMORY";
        errorMessage = "AI local không đủ bộ nhớ cho cấu hình hiện tại.";
      } else if (err instanceof Error) {
        errorMessage = err.message;
        if (/connect ECONNREFUSED|Ollama is not configured|unavailable/i.test(err.message)) {
          errorCode = "OLLAMA_OFFLINE";
          errorMessage = "Không thể kết nối đến Ollama local (127.0.0.1:11434). Hãy kiểm tra Docker container.";
        }
      }

      await db.aiJob.update({
        where: { id: jobId },
        data: {
          status: isCancelled ? "cancelled" : "failed",
          errorCode,
          errorMessage,
          completedAt: new Date(),
        },
      });
    } finally {
      this.activeJobId = null;
      this.activeAbortController = null;
      this.isProcessing = false;

      // Continue to next queued job
      setImmediate(() => this.processNext());
    }
  }

  private serializeJob(
    job: {
      id: string;
      type: string;
      status: string;
      stage: string | null;
      progress: number;
      input: unknown;
      resultId: string | null;
      resultUrl: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      createdAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
    },
    queuePosition?: number
  ): AiJobSummary {
    return {
      id: job.id,
      type: job.type,
      status: job.status as AiJobStatus,
      stage: (job.stage || "queued") as AiJobStage,
      progress: job.progress,
      input: job.input as StoryJobInput | LessonJobInput,
      resultId: job.resultId,
      resultUrl: job.resultUrl,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      queuePosition,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    };
  }
}

// Global singleton across hot-reloads in Next.js development
const globalForAiJobs = globalThis as unknown as { aiJobQueueManager?: AiJobQueueManager };
export const aiJobService = globalForAiJobs.aiJobQueueManager || new AiJobQueueManager();
if (process.env.NODE_ENV !== "production") globalForAiJobs.aiJobQueueManager = aiJobService;
