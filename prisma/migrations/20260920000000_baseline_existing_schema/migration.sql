-- Baseline for the pre-existing MySQL schema. This migration represents the
-- schema immediately before the two incremental migrations that follow it.
-- Existing databases are recorded as applied with `prisma migrate resolve`;
-- this SQL is for a fresh database only.

-- CreateTable
CREATE TABLE `decks` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `folderId` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `decks_folderId_idx`(`folderId`),
    INDEX `decks_folderId_position_idx`(`folderId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `folders` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `normalizedName` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `icon` VARCHAR(191) NOT NULL DEFAULT 'book',
    `color` VARCHAR(191) NOT NULL DEFAULT 'orange',
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `folders_normalizedName_key`(`normalizedName`),
    INDEX `folders_position_idx`(`position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flashcards` (
    `id` VARCHAR(191) NOT NULL,
    `deckId` VARCHAR(191) NOT NULL,
    `term` VARCHAR(191) NOT NULL,
    `normalizedTerm` VARCHAR(191) NOT NULL,
    `meaningVi` TEXT NOT NULL,
    `definitionEn` TEXT NOT NULL,
    `ipa` VARCHAR(191) NULL,
    `partOfSpeech` VARCHAR(191) NULL,
    `cefr` VARCHAR(191) NULL,
    `exampleEn` TEXT NOT NULL,
    `exampleVi` TEXT NOT NULL,
    `imageUrl` TEXT NULL,
    `imageSource` VARCHAR(191) NULL,
    `imageSearchQuery` VARCHAR(191) NULL,
    `imagePageUrl` TEXT NULL,
    `imageAuthor` VARCHAR(191) NULL,
    `imageLicense` VARCHAR(191) NULL,
    `status` ENUM('NEW', 'LEARNING', 'KNOWN') NOT NULL DEFAULT 'NEW',
    `due` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastReviewAt` DATETIME(3) NULL,
    `reps` INTEGER NOT NULL DEFAULT 0,
    `lapses` INTEGER NOT NULL DEFAULT 0,
    `stability` DOUBLE NOT NULL DEFAULT 0,
    `difficulty` DOUBLE NOT NULL DEFAULT 0,
    `elapsedDays` INTEGER NOT NULL DEFAULT 0,
    `scheduledDays` INTEGER NOT NULL DEFAULT 0,
    `state` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `flashcards_deckId_idx`(`deckId`),
    INDEX `flashcards_due_idx`(`due`),
    INDEX `flashcards_deckId_due_idx`(`deckId`, `due`),
    UNIQUE INDEX `flashcards_deckId_normalizedTerm_key`(`deckId`, `normalizedTerm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review_logs` (
    `id` VARCHAR(191) NOT NULL,
    `cardId` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `state` INTEGER NOT NULL,
    `due` DATETIME(3) NOT NULL,
    `stability` DOUBLE NOT NULL,
    `difficulty` DOUBLE NOT NULL,
    `elapsedDays` INTEGER NOT NULL,
    `lastElapsedDays` INTEGER NOT NULL,
    `scheduledDays` INTEGER NOT NULL,
    `review` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `review_logs_cardId_idx`(`cardId`),
    INDEX `review_logs_review_idx`(`review`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `totalChunks` INTEGER NOT NULL DEFAULT 0,
    `processedChunks` INTEGER NOT NULL DEFAULT 0,
    `wordCount` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `resultData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stories` (
    `id` VARCHAR(191) NOT NULL,
    `deckId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `cefr` VARCHAR(191) NOT NULL,
    `length` VARCHAR(191) NOT NULL,
    `topic` VARCHAR(191) NOT NULL,
    `targetWords` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `stories_deckId_idx`(`deckId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `deckId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `total` INTEGER NOT NULL,
    `accuracy` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `quiz_attempts_deckId_idx`(`deckId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `deckId` VARCHAR(191) NOT NULL,
    `questions` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `quiz_sessions_deckId_idx`(`deckId`),
    INDEX `quiz_sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `decks` ADD CONSTRAINT `decks_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `flashcards` ADD CONSTRAINT `flashcards_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `decks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `review_logs` ADD CONSTRAINT `review_logs_cardId_fkey` FOREIGN KEY (`cardId`) REFERENCES `flashcards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stories` ADD CONSTRAINT `stories_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `decks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `quiz_attempts` ADD CONSTRAINT `quiz_attempts_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `decks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `quiz_sessions` ADD CONSTRAINT `quiz_sessions_deckId_fkey` FOREIGN KEY (`deckId`) REFERENCES `decks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
