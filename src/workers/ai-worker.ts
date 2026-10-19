import { randomUUID } from "node:crypto";
import { Prisma, type AiJob } from "@prisma/client";
import { db } from "@/lib/db";
import { AICancelledError, AIOomError, AIProviderUnavailableError, AITimeoutError } from "@/services/ai/ai-core";
import { runWithDurableAiLease } from "@/services/ai/ai-access-service";
import {
  aiJobService,
  parseAiJobInput,
  type AiJobLease,
  type ArtifactGenerationResult,
} from "@/services/ai/ai-job-service";
import { executeStoryPipeline } from "@/services/ai/story-pipeline";
import { lessonService } from "@/services/vocabulary";

const IDLE_POLL_MS = 1_000;
const PROVIDER_BACKOFF_MS = 5_000;
const HEARTBEAT_MS = 5_000;

class CancellationBeforeFinalizationError extends Error {
  constructor() {
    super("Cancellation requested before finalization.");
    this.name = "CancellationBeforeFinalizationError";
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isProviderFailure(error: unknown): boolean {
  return error instanceof AIProviderUnavailableError ||
    (error instanceof Error && /ECONNREFUSED|Ollama.*(offline|unavailable)|fetch failed/i.test(error.message));
}

function errorDetails(type: string, error: unknown, aborted: boolean, timedOut = false) {
  if (timedOut || error instanceof AITimeoutError) {
    return { status: "failed", stage: "failed" as const, code: "AI_TIMEOUT", message: "AI mất quá nhiều thời gian để hoàn tất tác vụ." };
  }
  if (aborted || error instanceof AICancelledError || error instanceof CancellationBeforeFinalizationError) {
    return { status: "cancelled", stage: "cancelled" as const, code: "AI_CANCELLED", message: "Tác vụ đã bị người dùng hủy." };
  }
  if (error instanceof AIOomError) {
    return { status: "failed", stage: "failed" as const, code: "AI_OUT_OF_MEMORY", message: "AI local không đủ bộ nhớ cho cấu hình hiện tại." };
  }
  if (isProviderFailure(error)) {
    return { status: "failed", stage: "failed" as const, code: "OLLAMA_OFFLINE", message: "Không thể kết nối đến Ollama local. Hãy kiểm tra dịch vụ Ollama." };
  }
  if (error instanceof Error && /không tìm thấy bộ|không còn thuộc bộ thẻ|không thuộc bộ từ/i.test(error.message)) {
    return { status: "failed", stage: "failed" as const, code: "AI_STALE_TARGET", message: "Mục tiêu tạo nội dung không còn tồn tại hoặc đã thay đổi. Tác vụ không gọi AI." };
  }
  return {
    status: "failed",
    stage: "failed" as const,
    code: "AI_UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : `Không thể hoàn tất ${type}.`,
  };
}

/**
 * One independently managed, DB-backed worker. The database is the authority:
 * this class only executes a job after `claimNextLongJob` atomically takes the
 * global lease, and holds that lease for the whole generation pipeline.
 */
export class DurableAiWorker {
  private stopping = false;
  private providerBackoffUntil = 0;

  /** Optional seam used by scheduler tests; production leaves it undefined. */
  constructor(
    private readonly testExecutor?: (job: AiJob) => Promise<void>,
    private readonly workerId = `wordnest-ai-${randomUUID()}`
  ) {}

  async initialize(): Promise<void> {
    await aiJobService.retireLegacyFlashcardJobs();
    await aiJobService.recoverStaleRunningJobs();
  }

  stop(): void {
    this.stopping = true;
  }

  async runOnce(): Promise<boolean> {
    if (Date.now() < this.providerBackoffUntil) return false;
    const job = await aiJobService.claimNextLongJob(this.workerId);
    if (!job) return false;
    await this.executeClaimedJob(job);
    return true;
  }

  async runForever(): Promise<void> {
    await this.initialize();
    while (!this.stopping) {
      const didRun = await this.runOnce();
      if (this.stopping) break;
      if (!didRun) {
        const wait = Math.max(IDLE_POLL_MS, this.providerBackoffUntil - Date.now());
        await sleep(wait);
      }
    }
  }

  private async executeClaimedJob(job: AiJob): Promise<void> {
    const parsed = parseAiJobInput(job.type, job.input);
    if (!parsed) {
      await this.failJob(job.id, "AI_INVALID_JOB_INPUT", "Dữ liệu tác vụ AI không hợp lệ.");
      return;
    }

    const lease: AiJobLease = {
      jobId: job.id,
      workerId: job.workerId ?? this.workerId,
      leaseToken: job.leaseToken ?? "legacy-test-lease",
    };
    const controller = new AbortController();
    const cancellationWatcher = setInterval(() => {
      aiJobService.isCancellationRequested(job.id)
        .then((requested) => { if (requested) controller.abort(); })
        .catch(() => { /* A transient polling error must not terminate generation. */ });
    }, 400);

    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15 * 60 * 1_000);
    const heartbeat = setInterval(() => {
      aiJobService.heartbeat(lease)
        .then((owned) => { if (!owned) controller.abort(); })
        .catch(() => { controller.abort(); });
    }, HEARTBEAT_MS);
    try {
      if (this.testExecutor) {
        await this.testExecutor(job);
        return;
      }
      await runWithDurableAiLease(job.id, async () => {
        if (parsed.kind === "lesson_generation") {
          await this.executeLessonJob(lease, parsed, controller.signal);
        } else {
          await this.executeStoryJob(lease, parsed, controller.signal);
        }
      });
    } catch (error) {
      const details = errorDetails(job.type, error, controller.signal.aborted, timedOut);
      if (details.code === "OLLAMA_OFFLINE") {
        this.providerBackoffUntil = Date.now() + PROVIDER_BACKOFF_MS;
      }
      await aiJobService.failClaimedJob(lease, details.code, details.message);
    } finally {
      clearInterval(cancellationWatcher);
      clearTimeout(timeout);
      clearInterval(heartbeat);
    }
  }

  private async executeLessonJob(
    lease: AiJobLease,
    input: import("@/services/ai/ai-job-service").LessonGenerationJobInput,
    signal: AbortSignal
  ) {
    const draft = await lessonService.generateLessonDraft({
      deckId: input.deckId,
      targetWords: input.targetWords,
      cefr: input.cefr,
      topic: input.topic,
      signal,
      onStageChange: async (stage) => aiJobService.updateRunningStage(lease.jobId, stage, lease),
    });
    if (signal.aborted || await aiJobService.isCancellationRequested(lease.jobId)) {
      throw new CancellationBeforeFinalizationError();
    }
    await aiJobService.updateRunningStage(lease.jobId, "saving", lease);
    await this.finalizeLesson(lease.jobId, draft, input.deckId, lease);
  }

  private async executeStoryJob(
    lease: AiJobLease,
    input: import("@/services/ai/ai-job-service").StoryGenerationJobInput,
    signal: AbortSignal
  ) {
    const generated = await executeStoryPipeline({
      deckId: input.deckId,
      targetWords: input.targetWords,
      cefr: input.cefr,
      length: input.length,
      topic: input.topic,
      narrationVoiceId: input.narrationVoiceId as never,
      signal,
      persist: false,
      onStageChange: async (stage) => aiJobService.updateRunningStage(lease.jobId, stage, lease),
    });
    if (signal.aborted || await aiJobService.isCancellationRequested(lease.jobId)) {
      throw new CancellationBeforeFinalizationError();
    }
    await aiJobService.updateRunningStage(lease.jobId, "saving", lease);
    await this.finalizeStory(lease.jobId, generated.draft, input.deckId, lease);
  }

  private async finalizeStory(jobId: string, draft: Prisma.StoryUncheckedCreateInput, deckId: string, lease?: AiJobLease) {
    await db.$transaction(async (tx) => {
      const story = await tx.story.create({ data: draft });
      const result: ArtifactGenerationResult = {
        kind: "story_generation_result", schemaVersion: 1, artifactId: story.id, deckId,
      };
      const updated = await tx.aiJob.updateMany({
        where: { id: jobId, status: "running", cancelRequestedAt: null, ...(lease ? { workerId: lease.workerId, leaseToken: lease.leaseToken } : {}) },
        data: {
          status: "completed", stage: "completed", progress: 0,
          result: result as unknown as Prisma.InputJsonValue,
          resultId: story.id, resultUrl: `/decks/${deckId}/story?storyId=${story.id}`,
          completedAt: new Date(), workerId: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null,
        },
      });
      if (updated.count !== 1) throw new CancellationBeforeFinalizationError();
    });
  }

  private async finalizeLesson(jobId: string, draft: Prisma.LessonUncheckedCreateInput, deckId: string, lease?: AiJobLease) {
    await db.$transaction(async (tx) => {
      const lesson = await tx.lesson.create({ data: draft });
      const result: ArtifactGenerationResult = {
        kind: "lesson_generation_result", schemaVersion: 1, artifactId: lesson.id, deckId,
      };
      const updated = await tx.aiJob.updateMany({
        where: { id: jobId, status: "running", cancelRequestedAt: null, ...(lease ? { workerId: lease.workerId, leaseToken: lease.leaseToken } : {}) },
        data: {
          status: "completed", stage: "completed", progress: 0,
          result: result as unknown as Prisma.InputJsonValue,
          resultId: lesson.id, resultUrl: `/decks/${deckId}/lesson?lessonId=${lesson.id}`,
          completedAt: new Date(), workerId: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null,
        },
      });
      if (updated.count !== 1) throw new CancellationBeforeFinalizationError();
    });
  }

  private async failJob(jobId: string, code: string, message: string) {
    await db.aiJob.updateMany({
      where: { id: jobId, status: "running" },
      data: { status: "failed", stage: "failed", errorCode: code, errorMessage: message, completedAt: new Date() },
    });
  }
}

async function main() {
  const worker = new DurableAiWorker();
  const shutdown = () => worker.stop();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await worker.runForever();
  } finally {
    await db.$disconnect();
  }
}

if (/ai-worker\.(?:ts|js)$/.test(process.argv[1] || "")) {
  main().catch((error) => {
    console.error("[AiWorker] Fatal worker error", error);
    process.exitCode = 1;
  });
}
