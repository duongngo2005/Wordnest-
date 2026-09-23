-- Per-answer quiz evidence. QuizSession is deleted on successful submission, so
-- sessionId remains a historical grouping value rather than a foreign key.
CREATE TABLE `practice_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `flashcardId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(32) NOT NULL,
    `questionType` VARCHAR(64) NOT NULL,
    `correct` BOOLEAN NOT NULL,
    `answer` TEXT NOT NULL,
    `expectedAnswer` TEXT NOT NULL,
    `responseMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `practice_attempts_flashcardId_createdAt_idx`(`flashcardId`, `createdAt`),
    INDEX `practice_attempts_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `practice_attempts`
  ADD CONSTRAINT `practice_attempts_flashcardId_fkey`
  FOREIGN KEY (`flashcardId`) REFERENCES `flashcards`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
