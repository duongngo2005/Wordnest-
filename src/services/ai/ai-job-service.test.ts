import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { aiJobService, parseAiJobInput } from "./ai-job-service";
import { DurableAiWorker } from "@/workers/ai-worker";
import { AIProviderUnavailableError } from "./ai-core";
import type { Prisma } from "@prisma/client";

const ids = new Set<string>();
const deckIds = new Set<string>();

function storyInput(deckId = "queue-deck") {
  return {
    kind: "story_generation" as const,
    schemaVersion: 1 as const,
    deckId,
    targetWords: ["apply"],
    cefr: "B1" as const,
    length: "short" as const,
    topic: "Daily Life",
  };
}

async function seed(
  id: string,
  type: "story_generation" | "lesson_generation" = "story_generation",
  status = "queued",
  createdAt = new Date()
) {
  ids.add(id);
  const input = type === "lesson_generation"
    ? { kind: type, schemaVersion: 1, deckId: "queue-deck", targetWords: ["card-1"], cefr: "B1", topic: "Daily Life" }
    : storyInput();
  return db.aiJob.create({
    data: {
      id, type, status, stage: status === "running" ? "generating_story" : "queued", input, createdAt, updatedAt: createdAt,
    },
  });
}

async function seedLegacyFlashcardJob(id: string, status = "queued", leaseExpiresAt?: Date) {
  ids.add(id);
  return db.aiJob.create({
    data: {
      id,
      type: "flashcard_generation",
      status,
      stage: status === "running" ? "generating_flashcards" : "queued",
      input: { kind: "flashcard_generation", schemaVersion: 1, deckId: "legacy-deck", requestedTerms: ["apply"], rawInput: "apply" },
      ...(status === "running" ? { workerId: "legacy-worker", leaseToken: "legacy-lease", leaseExpiresAt } : {}),
      items: { create: { sequence: 0, requestedTerm: "apply", status: "pending", stage: "pending" } },
    },
  });
}

afterEach(async () => {
  await db.aiJob.deleteMany({ where: { id: { in: [...ids] } } });
  await db.deck.deleteMany({ where: { id: { in: [...deckIds] } } });
  ids.clear();
  deckIds.clear();
  vi.restoreAllMocks();
});

describe("durable AiJob scheduler", () => {
  it("claims A/B/C in global FIFO order and never overlaps execution", async () => {
    const time = new Date("2026-10-08T00:00:00.000Z");
    await seed("queue-a", "story_generation", "queued", time);
    await seed("queue-b", "lesson_generation", "queued", time);

    const events: string[] = [];
    let active = 0;
    let maxObservedConcurrency = 0;
    const executor = async (job: { id: string }) => {
      events.push(`${job.id}:start`);
      active += 1;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      events.push(`${job.id}:finish`);
      await db.aiJob.update({ where: { id: job.id }, data: { status: "completed", stage: "completed", completedAt: new Date() } });
    };
    const workerA = new DurableAiWorker(executor);
    const workerB = new DurableAiWorker(executor);

    const first = await Promise.all([workerA.runOnce(), workerB.runOnce()]);
    expect(first.filter(Boolean)).toHaveLength(1);
    await workerA.runOnce();
    await workerB.runOnce();

    expect(events).toEqual([
      "queue-a:start", "queue-a:finish",
      "queue-b:start", "queue-b:finish",
    ]);
    expect(maxObservedConcurrency).toBe(1);
  });

  it("makes competing claimers choose only one global running job", async () => {
    await seed("race-a");
    await seed("race-b");
    const [left, right] = await Promise.all([aiJobService.claimNextLongJob(), aiJobService.claimNextLongJob()]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    expect((await db.aiJob.count({ where: { status: "running" } }))).toBe(1);
  });

  it("does not let an interactive reservation jump a queued durable job", async () => {
    await seed("queued-before-interactive");
    await expect(aiJobService.acquireInteractiveReservation()).resolves.toBeNull();
  });

  it("makes a concurrent interactive reservation and durable claim mutually exclusive", async () => {
    await seed("interactive-race");
    const [claim, reservation] = await Promise.all([
      aiJobService.claimNextLongJob(),
      aiJobService.acquireInteractiveReservation(),
    ]);
    expect(Boolean(claim) === Boolean(reservation)).toBe(false);
    if (reservation) {
      ids.add(reservation);
      await aiJobService.releaseInteractiveReservation(reservation);
    }
  });

  it("cancels queued work without allowing it to claim or invoke a worker", async () => {
    await seed("cancel-queued");
    await expect(aiJobService.cancelJob("cancel-queued")).resolves.toMatchObject({ success: true });
    await expect(aiJobService.claimNextLongJob()).resolves.toBeNull();
    await expect(db.aiJob.findUnique({ where: { id: "cancel-queued" } })).resolves.toMatchObject({ status: "cancelled" });
  });

  it("continues with B after A fails", async () => {
    await seed("failure-a");
    await seed("failure-b");
    const started: string[] = [];
    const worker = new DurableAiWorker(async (job) => {
      started.push(job.id);
      if (job.id === "failure-a") throw new Error("bad prompt");
      await db.aiJob.update({ where: { id: job.id }, data: { status: "completed", stage: "completed", completedAt: new Date() } });
    });
    await worker.runOnce();
    await worker.runOnce();
    expect(started).toEqual(["failure-a", "failure-b"]);
    await expect(db.aiJob.findUnique({ where: { id: "failure-a" } })).resolves.toMatchObject({ status: "failed" });
  });

  it("backs off after an offline provider instead of burning through pending jobs", async () => {
    await seed("offline-a");
    await seed("offline-b");
    const worker = new DurableAiWorker(async () => { throw new AIProviderUnavailableError(); });
    await worker.runOnce();
    expect(await worker.runOnce()).toBe(false);
    await expect(db.aiJob.findUnique({ where: { id: "offline-a" } })).resolves.toMatchObject({ status: "failed", errorCode: "OLLAMA_OFFLINE" });
    await expect(db.aiJob.findUnique({ where: { id: "offline-b" } })).resolves.toMatchObject({ status: "queued" });
  });

  it("recovers a stale worker-owned run and honors durable cancellation intent", async () => {
    await seed("recover-running", "story_generation", "running");
    await aiJobService.recoverStaleRunningJobs();
    await expect(db.aiJob.findUnique({ where: { id: "recover-running" } })).resolves.toMatchObject({ status: "queued", stage: "queued" });

    await db.aiJob.update({ where: { id: "recover-running" }, data: { status: "running", cancelRequestedAt: new Date() } });
    await aiJobService.recoverStaleRunningJobs();
    await expect(db.aiJob.findUnique({ where: { id: "recover-running" } })).resolves.toMatchObject({ status: "cancelled" });
  });

  it("returns the same Story job for the same client idempotency key and allows a later intentional request", async () => {
    const sameKey = "d719caca-6800-41d9-8be1-4d3b317a9ef1";
    const first = await aiJobService.createStoryJob(storyInput(), sameKey);
    ids.add(first.id);
    const retry = await aiJobService.createStoryJob(storyInput(), sameKey);
    const second = await aiJobService.createStoryJob(storyInput(), "6b085f25-21a8-4989-b5c4-83c70e0fc3b0");
    ids.add(second.id);
    expect(retry.id).toBe(first.id);
    expect(second.id).not.toBe(first.id);
  });

  it("normalizes a pre-V1.1C queued Story payload instead of dropping it on upgrade", () => {
    expect(parseAiJobInput("story_generation", {
      deckId: "queue-deck", targetWords: ["apply"], cefr: "B1", length: "short", topic: "Daily Life",
    })).toMatchObject({ kind: "story_generation", schemaVersion: 1, deckId: "queue-deck" });
  });

  it("retires queued legacy flashcard jobs without deleting their checkpoint history", async () => {
    await seedLegacyFlashcardJob("retired-flashcard");

    await expect(aiJobService.retireLegacyFlashcardJobs()).resolves.toMatchObject({ cancelled: 1, cancellationRequested: 0 });
    await expect(db.aiJob.findUnique({ where: { id: "retired-flashcard" } })).resolves.toMatchObject({
      status: "cancelled",
      errorCode: "AI_FEATURE_RETIRED",
    });
    await expect(db.aiJobItem.findFirst({ where: { jobId: "retired-flashcard" } })).resolves.toMatchObject({ status: "cancelled" });
    await expect(aiJobService.getActiveAndRecentJobs()).resolves.not.toContainEqual(expect.objectContaining({ id: "retired-flashcard" }));
    await expect(aiJobService.retryJob("retired-flashcard")).rejects.toThrow("Chỉ có thể thử lại");
  });

  it("requests cancellation for a legacy flashcard job with a live lease, then retires it after the lease expires", async () => {
    await seedLegacyFlashcardJob("retiring-live-flashcard", "running", new Date(Date.now() + 60_000));

    await expect(aiJobService.retireLegacyFlashcardJobs()).resolves.toMatchObject({ cancelled: 0, cancellationRequested: 1 });
    await expect(db.aiJob.findUnique({ where: { id: "retiring-live-flashcard" } })).resolves.toMatchObject({
      status: "running",
      stage: "cancel_requested",
      errorCode: "AI_FEATURE_RETIRED",
    });

    await db.aiJob.update({ where: { id: "retiring-live-flashcard" }, data: { leaseExpiresAt: new Date(Date.now() - 1) } });
    await aiJobService.retireLegacyFlashcardJobs();
    await expect(db.aiJob.findUnique({ where: { id: "retiring-live-flashcard" } })).resolves.toMatchObject({ status: "cancelled" });
  });

  it("atomically finalizes Story and Lesson artifacts with their completed job rows", async () => {
    const deckId = "queue-atomic-deck";
    deckIds.add(deckId);
    await db.deck.create({ data: { id: deckId, name: "Atomic artifacts" } });
    await seed("atomic-story", "story_generation", "running");
    const worker = new DurableAiWorker() as unknown as {
      finalizeStory(jobId: string, draft: Prisma.StoryUncheckedCreateInput, targetDeckId: string): Promise<void>;
      finalizeLesson(jobId: string, draft: Prisma.LessonUncheckedCreateInput, targetDeckId: string): Promise<void>;
    };
    await worker.finalizeStory("atomic-story", {
      deckId, title: "Atomic story", content: "A complete story.", cefr: "B1", length: "short", topic: "Daily Life", targetWords: [],
    }, deckId);
    const completedStoryJob = await db.aiJob.findUnique({ where: { id: "atomic-story" } });
    expect(completedStoryJob).toMatchObject({ status: "completed", resultId: expect.any(String) });
    expect(await db.story.findUnique({ where: { id: completedStoryJob!.resultId! } })).toMatchObject({ deckId, title: "Atomic story" });

    await seed("atomic-lesson", "lesson_generation", "running");
    await worker.finalizeLesson("atomic-lesson", {
      deckId, title: "Atomic lesson", content: "A complete lesson.", cefr: "B1", targetWords: [],
    }, deckId);
    const completedLessonJob = await db.aiJob.findUnique({ where: { id: "atomic-lesson" } });
    expect(completedLessonJob).toMatchObject({ status: "completed", resultId: expect.any(String) });
    expect(await db.lesson.findUnique({ where: { id: completedLessonJob!.resultId! } })).toMatchObject({ deckId, title: "Atomic lesson" });

    await seed("atomic-rollback", "story_generation", "running");
    await expect(worker.finalizeStory("atomic-rollback", {
      deckId: "deleted-deck", title: "Must not persist", content: "No orphan story.", cefr: "B1", length: "short", topic: "Daily Life", targetWords: [],
    }, "deleted-deck")).rejects.toThrow();
    await expect(db.aiJob.findUnique({ where: { id: "atomic-rollback" } })).resolves.toMatchObject({ status: "running" });
    expect(await db.story.count({ where: { title: "Must not persist" } })).toBe(0);
  });

});
