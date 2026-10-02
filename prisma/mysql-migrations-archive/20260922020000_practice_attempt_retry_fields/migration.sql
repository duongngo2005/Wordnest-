-- AlterTable
ALTER TABLE `practice_attempts` ADD COLUMN `attemptNumber` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `prompt` TEXT NULL,
    ADD COLUMN `questionId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `practice_attempts_sessionId_questionId_idx` ON `practice_attempts`(`sessionId`, `questionId`);
