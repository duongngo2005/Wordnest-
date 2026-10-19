-- Daily foreground activity for the personal WordNest installation.
-- This table intentionally has no Deck/Card relation: online time is a global
-- context metric and must not mutate FSRS or practice evidence.

CREATE TABLE "daily_online_activity" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
