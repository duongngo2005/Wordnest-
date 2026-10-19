-- V1.3 source deletion retention.
--
-- A Deck is an organizational source. Deleting it must not cascade-delete
-- authored Stories/Lessons, completed QuizAttempts, or an in-flight
-- QuizSession. SQLite uses table rebuilds to replace the legacy CASCADE FKs
-- with nullable SET NULL FKs while retaining every primary key and timestamp.

PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

CREATE TABLE "new_stories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cefr" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "targetWords" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "stories_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_stories" ("id", "deckId", "title", "content", "cefr", "length", "topic", "targetWords", "createdAt", "updatedAt")
SELECT "id", "deckId", "title", "content", "cefr", "length", "topic", "targetWords", "createdAt", "updatedAt"
FROM "stories";
DROP TABLE "stories";
ALTER TABLE "new_stories" RENAME TO "stories";
CREATE INDEX "stories_deckId_idx" ON "stories"("deckId");

CREATE TABLE "new_lessons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cefr" TEXT NOT NULL DEFAULT 'B1',
    "targetWords" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "lessons_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_lessons" ("id", "deckId", "title", "content", "cefr", "targetWords", "createdAt", "updatedAt")
SELECT "id", "deckId", "title", "content", "cefr", "targetWords", "createdAt", "updatedAt"
FROM "lessons";
DROP TABLE "lessons";
ALTER TABLE "new_lessons" RENAME TO "lessons";
CREATE INDEX "lessons_deckId_idx" ON "lessons"("deckId");

CREATE TABLE "new_quiz_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "accuracy" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_attempts_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_quiz_attempts" ("id", "deckId", "score", "total", "accuracy", "createdAt")
SELECT "id", "deckId", "score", "total", "accuracy", "createdAt"
FROM "quiz_attempts";
DROP TABLE "quiz_attempts";
ALTER TABLE "new_quiz_attempts" RENAME TO "quiz_attempts";
CREATE INDEX "quiz_attempts_deckId_idx" ON "quiz_attempts"("deckId");

CREATE TABLE "new_quiz_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT,
    "questions" JSONB NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_sessions_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_quiz_sessions" ("id", "deckId", "questions", "expiresAt", "createdAt")
SELECT "id", "deckId", "questions", "expiresAt", "createdAt"
FROM "quiz_sessions";
DROP TABLE "quiz_sessions";
ALTER TABLE "new_quiz_sessions" RENAME TO "quiz_sessions";
CREATE INDEX "quiz_sessions_deckId_idx" ON "quiz_sessions"("deckId");
CREATE INDEX "quiz_sessions_expiresAt_idx" ON "quiz_sessions"("expiresAt");

PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys=ON;
