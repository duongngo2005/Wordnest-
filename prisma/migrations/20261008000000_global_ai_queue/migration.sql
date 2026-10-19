-- Durable background AI queue. All additions are nullable so existing job
-- history and packaged SQLite data remain readable during the upgrade.
-- Running jobs from the pre-lease implementation are conservatively marked
-- interrupted: an earlier version could persist an artifact before completing
-- its job row, so replaying them automatically could duplicate content.
UPDATE "ai_jobs"
SET "status" = 'interrupted',
    "stage" = 'interrupted',
    "errorCode" = 'AI_JOB_INTERRUPTED_UPGRADE',
    "errorMessage" = 'Tác vụ đang chạy trước khi nâng cấp đã bị gián đoạn. Hãy thử lại nếu cần.',
    "completedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'running';

ALTER TABLE "ai_jobs" ADD COLUMN "result" JSONB;
ALTER TABLE "ai_jobs" ADD COLUMN "cancelRequestedAt" DATETIME;
ALTER TABLE "ai_jobs" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "ai_jobs_idempotencyKey_key" ON "ai_jobs"("idempotencyKey");
CREATE INDEX "ai_jobs_status_createdAt_id_idx" ON "ai_jobs"("status", "createdAt", "id");

-- SQLite partial unique index: exactly one row, across durable and short
-- interactive reservations, may own the local-model lease at a time.
CREATE UNIQUE INDEX "ai_jobs_single_running_lease_idx"
ON "ai_jobs"((1))
WHERE "status" = 'running';
