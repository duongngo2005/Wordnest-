-- V1.2 durable flashcard checkpoints and fenced worker leases. Existing jobs
-- remain readable; flashcard jobs created before this migration retain their
-- legacy result JSON and are never silently converted into active cards.
ALTER TABLE "ai_jobs" ADD COLUMN "workerId" TEXT;
ALTER TABLE "ai_jobs" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "ai_jobs" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "ai_jobs" ADD COLUMN "heartbeatAt" DATETIME;
ALTER TABLE "ai_jobs" ADD COLUMN "availableAt" DATETIME;
ALTER TABLE "ai_jobs" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_jobs" ADD COLUMN "totalItems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_jobs" ADD COLUMN "processedItems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_jobs" ADD COLUMN "acceptedItems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_jobs" ADD COLUMN "failedItems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_jobs" ADD COLUMN "currentItemId" TEXT;
ALTER TABLE "ai_jobs" ADD COLUMN "currentTerm" TEXT;

UPDATE "ai_jobs" SET "availableAt" = "createdAt" WHERE "availableAt" IS NULL;

CREATE TABLE "ai_job_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "requestedTerm" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "stage" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "retryAfter" DATETIME,
  "failureCategory" TEXT,
  "failureReason" TEXT,
  "draft" JSONB,
  "savedFlashcardId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_job_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ai_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ai_job_items_jobId_sequence_key" ON "ai_job_items"("jobId", "sequence");
CREATE UNIQUE INDEX "ai_job_items_savedFlashcardId_key" ON "ai_job_items"("savedFlashcardId");
CREATE INDEX "ai_job_items_jobId_status_sequence_idx" ON "ai_job_items"("jobId", "status", "sequence");
CREATE INDEX "ai_job_items_status_retryAfter_idx" ON "ai_job_items"("status", "retryAfter");
CREATE INDEX "ai_jobs_status_availableAt_createdAt_id_idx" ON "ai_jobs"("status", "availableAt", "createdAt", "id");
CREATE INDEX "ai_jobs_leaseExpiresAt_idx" ON "ai_jobs"("leaseExpiresAt");
