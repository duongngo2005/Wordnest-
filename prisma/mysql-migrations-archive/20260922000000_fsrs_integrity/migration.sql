-- Persist all ts-fsrs card state and provide a narrow concurrency/idempotency protocol
-- for official scheduled reviews. Existing rows retain their legacy baseline values.
ALTER TABLE `flashcards`
  ADD COLUMN `learningSteps` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `schedulerVersion` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `review_logs`
  ADD COLUMN `reviewEventId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `review_logs_reviewEventId_key` ON `review_logs`(`reviewEventId`);
