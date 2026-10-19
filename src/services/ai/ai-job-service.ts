import { randomUUID } from "node:crypto";
import { Prisma, type AiJob } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  StoryCefrEnum,
  StoryLengthEnum,
  StoryTopicEnum,
} from "@/lib/validation/story";
import { AI_CONFIG } from "./ai-config";

/** Durable job kinds which consume the single local-model lease. */
export const LONG_RUNNING_AI_JOB_TYPES = [
  "story_generation",
  "lesson_generation",
] as const;

/** Stored for historical visibility only; new jobs of this type are retired. */
export const LEGACY_FLASHCARD_JOB_TYPE = "flashcard_generation" as const;
export type AiJobType = (typeof LONG_RUNNING_AI_JOB_TYPES)[number] | "interactive_reservation" | typeof LEGACY_FLASHCARD_JOB_TYPE;
export type AiJobStatus =
  | "queued"
  | "running"
  | "retry_pending"
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
  | "completed"
  | "cancel_requested"
  | "cancelled"
  | "failed"
  | "interrupted";

const schemaVersion = 1 as const;

const storyInputSchema = z.object({
  kind: z.literal("story_generation"),
  schemaVersion: z.literal(schemaVersion),
  deckId: z.string().min(1),
  targetWords: z.array(z.string().min(1)).min(1),
  cefr: StoryCefrEnum,
  length: StoryLengthEnum,
  topic: StoryTopicEnum,
  narrationVoiceId: z.string().min(1).optional(),
});

const lessonInputSchema = z.object({
  kind: z.literal("lesson_generation"),
  schemaVersion: z.literal(schemaVersion),
  deckId: z.string().min(1),
  targetWords: z.array(z.string().min(1)).min(1).max(20),
  cefr: StoryCefrEnum.optional(),
  topic: z.string().trim().max(120).optional(),
});

export const aiJobInputSchema = z.discriminatedUnion("kind", [
  storyInputSchema,
  lessonInputSchema,
]);

export type StoryGenerationJobInput = z.infer<typeof storyInputSchema>;
export type LessonGenerationJobInput = z.infer<typeof lessonInputSchema>;
export type DurableAiJobInput = z.infer<typeof aiJobInputSchema>;
// Compatibility aliases for existing route/component imports.
export type StoryJobInput = StoryGenerationJobInput;
export type LessonJobInput = LessonGenerationJobInput;

export type ArtifactGenerationResult = {
  kind: "story_generation_result" | "lesson_generation_result";
  schemaVersion: 1;
  artifactId: string;
  deckId: string;
};

export type AiJobSummary = {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  stage: AiJobStage;
  /** Legacy diagnostics only. UI must never render this as completion percent. */
  progress: number;
  input: DurableAiJobInput | Record<string, unknown>;
  resultId: string | null;
  resultUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  cancelRequestedAt?: string | null;
  totalItems?: number;
  processedItems?: number;
  acceptedItems?: number;
  failedItems?: number;
  currentTerm?: string | null;
  queuePosition?: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type AiJobLease = {
  jobId: string;
  workerId: string;
  leaseToken: string;
};

export const AI_JOB_LEASE_MS = 2 * 60 * 1_000;
export const AI_JOB_STALE_INFERENCE_GRACE_MS = AI_CONFIG.story.timeoutMs + 30_000;

export class AiQueueFullError extends Error {
  constructor() {
    super("Hàng đợi AI đang có quá nhiều tác vụ. Vui lòng hoàn tất hoặc hủy bớt tác vụ rồi thử lại.");
    this.name = "AiQueueFullError";
  }
}

export class AiJobNotRetryableError extends Error {
  constructor() {
    super("Chỉ có thể thử lại tác vụ AI bị lỗi, bị gián đoạn hoặc đã hủy.");
    this.name = "AiJobNotRetryableError";
  }
}

const PENDING_LONG_JOB_LIMIT = 250;

const aiJobSummarySelect = {
  id: true,
  type: true,
  status: true,
  stage: true,
  progress: true,
  input: true,
  resultId: true,
  resultUrl: true,
  errorCode: true,
  errorMessage: true,
  cancelRequestedAt: true,
  totalItems: true,
  processedItems: true,
  acceptedItems: true,
  failedItems: true,
  currentTerm: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
} satisfies Prisma.AiJobSelect;

export function parseAiJobInput(type: string, input: unknown): DurableAiJobInput | null {
  const parsed = aiJobInputSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  // V1.1B queued Story/Lesson jobs predate the discriminator. They are safe
  // to keep queued because their payloads already contain the same durable
  // feature inputs; normalize only at execution/retry time.
  if ((type === "story_generation" || type === "lesson_generation") && input && typeof input === "object") {
    const legacy = aiJobInputSchema.safeParse({
      ...(input as Record<string, unknown>),
      kind: type,
      schemaVersion,
    });
    if (legacy.success) return legacy.data;
  }
  return null;
}

function parseStoredInput(type: string, input: unknown): DurableAiJobInput | Record<string, unknown> {
  const parsed = parseAiJobInput(type, input);
  if (parsed) return parsed;

  // Existing V1.1B story/lesson rows were stored without a discriminator. They
  // remain inspectable, retryable only after the UI submits a new request.
  return typeof input === "object" && input !== null ? input as Record<string, unknown> : { type };
}

function serializeJob(job: Pick<AiJob,
  "id" | "type" | "status" | "stage" | "progress" | "input" | "resultId" | "resultUrl" |
  "errorCode" | "errorMessage" | "cancelRequestedAt" | "totalItems" | "processedItems" | "acceptedItems" |
  "failedItems" | "currentTerm" | "createdAt" | "startedAt" | "completedAt"
>, queuePosition?: number): AiJobSummary {
  return {
    id: job.id,
    type: job.type as AiJobType,
    status: job.status as AiJobStatus,
    stage: (job.stage || "queued") as AiJobStage,
    progress: job.progress,
    input: parseStoredInput(job.type, job.input),
    resultId: job.resultId,
    resultUrl: job.resultUrl,
    errorCode: job.errorCode,
  errorMessage: job.errorMessage,
  cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
  totalItems: job.totalItems,
  processedItems: job.processedItems,
  acceptedItems: job.acceptedItems,
  failedItems: job.failedItems,
  currentTerm: job.currentTerm,
    queuePosition,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

/**
 * Database-backed durable job repository. It intentionally owns no worker,
 * AbortController, timer, or in-memory queue. Those belong exclusively to the
 * separately launched worker process.
 */
export class AiJobService {
  async createStoryJob(
    input: Omit<StoryGenerationJobInput, "kind" | "schemaVersion">,
    idempotencyKey?: string
  ): Promise<AiJobSummary> {
    return this.enqueue({ kind: "story_generation", schemaVersion, ...input }, idempotencyKey);
  }

  async createLessonJob(
    input: Omit<LessonGenerationJobInput, "kind" | "schemaVersion">,
    idempotencyKey?: string
  ): Promise<AiJobSummary> {
    return this.enqueue({ kind: "lesson_generation", schemaVersion, ...input }, idempotencyKey);
  }

  private async enqueue(input: DurableAiJobInput, idempotencyKey?: string): Promise<AiJobSummary> {
    const parsed = aiJobInputSchema.parse(input);
    if (idempotencyKey) {
      const existing = await db.aiJob.findUnique({ where: { idempotencyKey } });
      if (existing) return this.getSummaryWithPosition(existing);
    }

    const pendingCount = await db.aiJob.count({
      where: { type: { in: [...LONG_RUNNING_AI_JOB_TYPES] }, status: { in: ["queued", "running"] } },
    });
    if (pendingCount >= PENDING_LONG_JOB_LIMIT) throw new AiQueueFullError();

    try {
      const now = new Date();
      const job = await db.aiJob.create({
        data: {
          type: parsed.kind,
          status: "queued",
          stage: "queued",
          progress: 0,
          input: parsed as unknown as Prisma.InputJsonValue,
          idempotencyKey: idempotencyKey || null,
          availableAt: now,
        },
      });
      return this.getSummaryWithPosition(job);
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await db.aiJob.findUnique({ where: { idempotencyKey } });
        if (existing) return this.getSummaryWithPosition(existing);
      }
      throw error;
    }
  }

  async retryJob(jobId: string, idempotencyKey = randomUUID()): Promise<AiJobSummary> {
    const job = await db.aiJob.findUnique({ where: { id: jobId } });
    if (!job) throw new AiJobNotRetryableError();
    const input = parseAiJobInput(job.type, job.input);
    if (!input) throw new AiJobNotRetryableError();
    if (!["failed", "cancelled", "interrupted"].includes(job.status)) throw new AiJobNotRetryableError();
    return this.enqueue(input, idempotencyKey);
  }

  async getJob(jobId: string): Promise<AiJobSummary | null> {
    const job = await db.aiJob.findUnique({ where: { id: jobId }, select: aiJobSummarySelect });
    return job ? this.getSummaryWithPosition(job) : null;
  }

  async getActiveAndRecentJobs(): Promise<AiJobSummary[]> {
    const [active, recent] = await Promise.all([
      db.aiJob.findMany({
        where: { type: { in: [...LONG_RUNNING_AI_JOB_TYPES] }, status: { in: ["queued", "running", "retry_pending"] } },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: 20,
        select: aiJobSummarySelect,
      }),
      db.aiJob.findMany({
        where: { type: { in: [...LONG_RUNNING_AI_JOB_TYPES] }, status: { in: ["completed", "failed", "cancelled", "interrupted"] } },
        orderBy: [{ completedAt: "desc" }, { id: "desc" }],
        take: 20,
        select: aiJobSummarySelect,
      }),
    ]);
    // Active work comes first so a long history never hides an actionable job.
    const jobs = [...active, ...recent].slice(0, 20);
    const positions = await this.queuePositions();
    return jobs.map((job) => serializeJob(job, positions.get(job.id)));
  }

  async getQueueCounts(): Promise<{ running: number; queued: number }> {
    const [running, queued] = await Promise.all([
      db.aiJob.count({ where: { type: { in: [...LONG_RUNNING_AI_JOB_TYPES] }, status: "running" } }),
      db.aiJob.count({ where: { type: { in: [...LONG_RUNNING_AI_JOB_TYPES] }, status: { in: ["queued", "retry_pending"] } } }),
    ]);
    return { running, queued };
  }

  async cancelJob(jobId: string): Promise<{ success: boolean; message: string }> {
    const now = new Date();
    const queued = await db.aiJob.updateMany({
      where: { id: jobId, status: { in: ["queued", "retry_pending"] }, type: { in: [...LONG_RUNNING_AI_JOB_TYPES] } },
      data: {
        status: "cancelled", stage: "cancelled", errorCode: "AI_CANCELLED",
        errorMessage: "Tác vụ đã bị hủy.", completedAt: now, currentItemId: null, currentTerm: null,
      },
    });
    if (queued.count > 0) return { success: true, message: "Đã hủy tác vụ trong hàng đợi." };

    const running = await db.aiJob.updateMany({
      where: { id: jobId, status: "running", type: { in: [...LONG_RUNNING_AI_JOB_TYPES] } },
      data: { cancelRequestedAt: new Date(), stage: "cancel_requested" },
    });
    return running.count > 0
      ? { success: true, message: "Đã gửi yêu cầu hủy tác vụ đang xử lý." }
      : { success: false, message: "Không thể hủy tác vụ AI này." };
  }

  /**
   * Retires legacy Local-AI flashcard jobs without deleting their audit trail,
   * accepted drafts, or any Flashcard rows already saved from those drafts.
   * A worker that still owns a live fenced lease receives cancellation intent;
   * only unleased or expired work is finalized here.
   */
  async retireLegacyFlashcardJobs(): Promise<{ cancelled: number; cancellationRequested: number }> {
    const now = new Date();
    return db.$transaction(async (tx) => {
      const queued = await tx.aiJob.findMany({
        where: {
          type: LEGACY_FLASHCARD_JOB_TYPE,
          status: { in: ["queued", "retry_pending"] },
        },
        select: { id: true },
      });
      const cancelled = await tx.aiJob.updateMany({
        where: { id: { in: queued.map((job) => job.id) } },
        data: {
          status: "cancelled",
          stage: "cancelled",
          errorCode: "AI_FEATURE_RETIRED",
          errorMessage: "Tạo flashcard bằng AI Local đã được ngừng hỗ trợ.",
          completedAt: now,
          currentItemId: null,
          currentTerm: null,
        },
      });
      if (queued.length > 0) {
        await tx.aiJobItem.updateMany({
          where: { jobId: { in: queued.map((job) => job.id) }, status: { in: ["pending", "retry_pending"] } },
          data: { status: "cancelled", stage: "cancelled", completedAt: now },
        });
      }

      const expiredRuns = await tx.aiJob.findMany({
        where: {
          type: LEGACY_FLASHCARD_JOB_TYPE,
          status: "running",
          OR: [{ leaseToken: null }, { leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
        },
        select: { id: true },
      });
      if (expiredRuns.length > 0) {
        const expiredIds = expiredRuns.map((job) => job.id);
        await tx.aiJobItem.updateMany({
          where: {
            jobId: { in: expiredIds },
            status: { in: ["pending", "retry_pending", "generating", "reviewing", "repairing"] },
          },
          data: { status: "cancelled", stage: "cancelled", completedAt: now },
        });
        await tx.aiJob.updateMany({
          where: { id: { in: expiredIds }, status: "running" },
          data: {
            status: "cancelled",
            stage: "cancelled",
            errorCode: "AI_FEATURE_RETIRED",
            errorMessage: "Tạo flashcard bằng AI Local đã được ngừng hỗ trợ.",
            completedAt: now,
            currentItemId: null,
            currentTerm: null,
            workerId: null,
            leaseToken: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
          },
        });
      }

      const cancellationRequested = await tx.aiJob.updateMany({
        where: {
          type: LEGACY_FLASHCARD_JOB_TYPE,
          status: "running",
          cancelRequestedAt: null,
        },
        data: {
          cancelRequestedAt: now,
          stage: "cancel_requested",
          errorCode: "AI_FEATURE_RETIRED",
          errorMessage: "Tạo flashcard bằng AI Local đã được ngừng hỗ trợ; tác vụ đang chạy sẽ dừng an toàn.",
        },
      });

      return { cancelled: cancelled.count + expiredRuns.length, cancellationRequested: cancellationRequested.count };
    });
  }

  /**
   * Only an expired fenced lease is recoverable. It waits longer than a single
   * Ollama request before requeueing, so a paused old process cannot overlap a
   * resumed inference. Legacy unleased rows are requeued for compatibility.
   */
  async recoverStaleRunningJobs(): Promise<void> {
    const now = new Date();
    await db.aiJob.updateMany({
      where: { status: "running", type: { in: [...LONG_RUNNING_AI_JOB_TYPES] }, cancelRequestedAt: { not: null } },
      data: { status: "cancelled", stage: "cancelled", errorCode: "AI_CANCELLED", errorMessage: "Tác vụ đã bị hủy khi máy chủ khởi động lại.", completedAt: now },
    });
    await db.aiJob.updateMany({
      where: {
        status: "running", type: { in: [...LONG_RUNNING_AI_JOB_TYPES] }, cancelRequestedAt: null,
        leaseToken: null,
      },
      data: { status: "queued", stage: "queued", progress: 0, startedAt: null, workerId: null },
    });
    await db.aiJob.updateMany({
      where: {
        status: "running", type: { in: [...LONG_RUNNING_AI_JOB_TYPES] }, cancelRequestedAt: null,
        leaseToken: { not: null }, leaseExpiresAt: { lt: now },
      },
      data: {
        status: "retry_pending", stage: "interrupted", errorCode: "AI_WORKER_INTERRUPTED",
        errorMessage: "Worker đã bị gián đoạn; tác vụ sẽ tiếp tục an toàn sau khi phiên AI cũ hết hạn.",
        availableAt: new Date(now.getTime() + AI_JOB_STALE_INFERENCE_GRACE_MS),
        workerId: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null,
        currentItemId: null, currentTerm: null,
      },
    });
    await db.aiJob.updateMany({
      where: { status: "retry_pending", availableAt: { lte: now }, type: { in: [...LONG_RUNNING_AI_JOB_TYPES] } },
      data: { status: "queued", stage: "queued", errorCode: null, errorMessage: null },
    });
    // Interactive reservations are process-local by nature and must never survive a restart.
    await db.aiJob.deleteMany({ where: { type: "interactive_reservation", status: "running" } });
  }

  /**
   * Atomically claims the oldest queued durable job only if no job or short
   * interactive reservation owns the global local-model lease. The SQLite
   * partial unique index is a second cross-process safety net.
   */
  async claimNextLongJob(workerId = `worker-${randomUUID()}`): Promise<AiJob | null> {
    await this.retireLegacyFlashcardJobs();
    await this.recoverStaleRunningJobs();
    const now = new Date();
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + AI_JOB_LEASE_MS);
    const ids = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "ai_jobs"
      SET "status" = 'running',
          "stage" = CASE "type"
            WHEN 'story_generation' THEN 'generating_story'
            ELSE 'generating_lesson'
          END,
          "startedAt" = ${now},
          "workerId" = ${workerId},
          "leaseToken" = ${leaseToken},
          "leaseExpiresAt" = ${leaseExpiresAt},
          "heartbeatAt" = ${now},
          "attemptCount" = "attemptCount" + 1,
          "updatedAt" = ${now}
      WHERE "id" = (
        SELECT "id" FROM "ai_jobs"
        WHERE "status" = 'queued'
          AND "type" IN ('story_generation', 'lesson_generation')
          AND ("availableAt" IS NULL OR "availableAt" <= ${now})
        ORDER BY COALESCE("availableAt", "createdAt") ASC, "createdAt" ASC, "id" ASC
        LIMIT 1
      )
        AND "status" = 'queued'
        AND NOT EXISTS (SELECT 1 FROM "ai_jobs" WHERE "status" = 'running')
      RETURNING "id"
    `);
    if (ids.length === 0) return null;
    return db.aiJob.findUnique({ where: { id: ids[0].id } });
  }

  /** Returns null instead of waiting when FIFO long work is queued or running. */
  async acquireInteractiveReservation(): Promise<string | null> {
    const id = `interactive-${randomUUID()}`;
    const now = new Date();
    try {
      const inserted = await db.$executeRaw(Prisma.sql`
        INSERT INTO "ai_jobs" (
          "id", "type", "status", "stage", "progress", "input", "createdAt", "startedAt", "updatedAt"
        )
        SELECT ${id}, 'interactive_reservation', 'running', 'interactive', 0,
          ${JSON.stringify({ kind: "interactive_reservation", schemaVersion })}, ${now}, ${now}, ${now}
        WHERE NOT EXISTS (SELECT 1 FROM "ai_jobs" WHERE "status" = 'running')
          AND NOT EXISTS (
            SELECT 1 FROM "ai_jobs"
            WHERE "status" = 'queued'
              AND "type" IN ('story_generation', 'lesson_generation')
          )
      `);
      return inserted === 1 ? id : null;
    } catch (error) {
      // A simultaneous durable claim can trip the partial unique index. That is
      // an expected busy result, not a server error.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2010" || /UNIQUE constraint failed/i.test(error.message))
      ) return null;
      throw error;
    }
  }

  async releaseInteractiveReservation(id: string): Promise<void> {
    await db.aiJob.deleteMany({ where: { id, type: "interactive_reservation" } });
  }

  async updateRunningStage(jobId: string, stage: AiJobStage, lease?: AiJobLease): Promise<void> {
    await db.aiJob.updateMany({
      where: {
        id: jobId, status: "running", cancelRequestedAt: null,
        ...(lease ? { workerId: lease.workerId, leaseToken: lease.leaseToken } : {}),
      },
      data: { stage },
    });
  }

  async heartbeat(lease: AiJobLease): Promise<boolean> {
    const now = new Date();
    const result = await db.aiJob.updateMany({
      where: {
        id: lease.jobId, status: "running", workerId: lease.workerId,
        leaseToken: lease.leaseToken, cancelRequestedAt: null,
      },
      data: {
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + AI_JOB_LEASE_MS),
      },
    });
    return result.count === 1;
  }

  async failClaimedJob(lease: AiJobLease, code: string, message: string): Promise<void> {
    await db.aiJob.updateMany({
      where: { id: lease.jobId, status: "running", workerId: lease.workerId, leaseToken: lease.leaseToken },
      data: {
        status: "failed", stage: "failed", errorCode: code, errorMessage: message,
        completedAt: new Date(), workerId: null, leaseToken: null, leaseExpiresAt: null, heartbeatAt: null,
        currentItemId: null, currentTerm: null,
      },
    });
  }

  async isCancellationRequested(jobId: string): Promise<boolean> {
    const job = await db.aiJob.findUnique({ where: { id: jobId }, select: { cancelRequestedAt: true, status: true } });
    return job?.status !== "running" || Boolean(job.cancelRequestedAt);
  }

  private async queuePositions(): Promise<Map<string, number>> {
    const queued = await db.aiJob.findMany({
      where: { status: "queued", type: { in: [...LONG_RUNNING_AI_JOB_TYPES] } },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    return new Map(queued.map((job, index) => [job.id, index + 1]));
  }

  private async getSummaryWithPosition(job: Pick<AiJob,
    "id" | "type" | "status" | "stage" | "progress" | "input" | "resultId" | "resultUrl" |
    "errorCode" | "errorMessage" | "cancelRequestedAt" | "totalItems" | "processedItems" | "acceptedItems" |
    "failedItems" | "currentTerm" | "createdAt" | "startedAt" | "completedAt"
  >): Promise<AiJobSummary> {
    const positions = job.status === "queued" ? await this.queuePositions() : new Map<string, number>();
    return serializeJob(job, positions.get(job.id));
  }
}

export const aiJobService = new AiJobService();
