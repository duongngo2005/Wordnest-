-- SQLite baseline for the local WordNest database.

CREATE TABLE "decks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "folderId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "decks_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "folders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'book',
    "color" TEXT NOT NULL DEFAULT 'orange',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "flashcards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "meaningVi" TEXT NOT NULL,
    "definitionEn" TEXT,
    "ipa" TEXT,
    "partOfSpeech" TEXT,
    "cefr" TEXT,
    "exampleEn" TEXT,
    "exampleVi" TEXT,
    "imageUrl" TEXT,
    "imageSource" TEXT,
    "imageSearchQuery" TEXT,
    "imagePageUrl" TEXT,
    "imageAuthor" TEXT,
    "imageLicense" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewAt" DATETIME,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "state" INTEGER NOT NULL DEFAULT 0,
    "schedulerVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "flashcards_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "review_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "state" INTEGER NOT NULL,
    "due" DATETIME NOT NULL,
    "stability" REAL NOT NULL,
    "difficulty" REAL NOT NULL,
    "elapsedDays" INTEGER NOT NULL,
    "lastElapsedDays" INTEGER NOT NULL,
    "scheduledDays" INTEGER NOT NULL,
    "reviewEventId" TEXT,
    "review" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_logs_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "flashcards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "stories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cefr" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "targetWords" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "stories_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "accuracy" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_attempts_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "quiz_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_sessions_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "practice_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flashcardId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT,
    "prompt" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answer" TEXT NOT NULL,
    "expectedAnswer" TEXT NOT NULL,
    "responseMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practice_attempts_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "flashcards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "decks_folderId_idx" ON "decks"("folderId");
CREATE INDEX "decks_folderId_position_idx" ON "decks"("folderId", "position");
CREATE UNIQUE INDEX "folders_normalizedName_key" ON "folders"("normalizedName");
CREATE INDEX "folders_position_idx" ON "folders"("position");
CREATE INDEX "flashcards_deckId_idx" ON "flashcards"("deckId");
CREATE INDEX "flashcards_due_idx" ON "flashcards"("due");
CREATE INDEX "flashcards_deckId_due_idx" ON "flashcards"("deckId", "due");
CREATE UNIQUE INDEX "flashcards_deckId_normalizedTerm_key" ON "flashcards"("deckId", "normalizedTerm");
CREATE UNIQUE INDEX "review_logs_reviewEventId_key" ON "review_logs"("reviewEventId");
CREATE INDEX "review_logs_cardId_idx" ON "review_logs"("cardId");
CREATE INDEX "review_logs_review_idx" ON "review_logs"("review");
CREATE INDEX "stories_deckId_idx" ON "stories"("deckId");
CREATE INDEX "quiz_attempts_deckId_idx" ON "quiz_attempts"("deckId");
CREATE INDEX "quiz_sessions_deckId_idx" ON "quiz_sessions"("deckId");
CREATE INDEX "quiz_sessions_expiresAt_idx" ON "quiz_sessions"("expiresAt");
CREATE INDEX "practice_attempts_flashcardId_createdAt_idx" ON "practice_attempts"("flashcardId", "createdAt");
CREATE INDEX "practice_attempts_sessionId_idx" ON "practice_attempts"("sessionId");
CREATE INDEX "practice_attempts_sessionId_questionId_idx" ON "practice_attempts"("sessionId", "questionId");

CREATE TABLE "ai_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'story_generation',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB NOT NULL,
    "resultId" TEXT,
    "resultUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs"("status");
CREATE INDEX "ai_jobs_type_status_idx" ON "ai_jobs"("type", "status");
