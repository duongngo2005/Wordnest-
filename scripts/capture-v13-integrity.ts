import { createHash } from "node:crypto";
import { db } from "@/lib/db";

const TABLES = [
  "folders",
  "decks",
  "flashcards",
  "deck_vocabulary_memberships",
  "vocabulary_identities",
  "review_logs",
  "practice_attempts",
  "stories",
  "lessons",
  "quiz_attempts",
  "quiz_sessions",
  "ai_jobs",
  "ai_job_items",
] as const;

type SqlRow = Record<string, unknown>;

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as SqlRow)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function scalar(row: SqlRow | undefined, name: string) {
  const value = row?.[name];
  return typeof value === "bigint" ? Number(value) : value;
}

async function main() {
  const availableRows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  );
  const available = new Set(availableRows.map(({ name }) => name));
  const tableSnapshots: Record<string, unknown> = {};

  for (const table of TABLES) {
    if (!available.has(table)) continue;
    const rows = await db.$queryRawUnsafe<SqlRow[]>(`SELECT * FROM "${table}" ORDER BY "id" ASC`);
    tableSnapshots[table] = {
      count: rows.length,
      idHash: hash(rows.map((row) => row.id)),
      contentHash: hash(rows),
    };
  }

  const schedulerRows = available.has("flashcards")
    ? await db.$queryRawUnsafe<SqlRow[]>(`
        SELECT "id", "due", "lastReviewAt", "reps", "lapses", "stability", "difficulty",
               "elapsedDays", "scheduledDays", "learningSteps", "state", "schedulerVersion"
        FROM "flashcards" ORDER BY "id" ASC
      `)
    : [];
  const duplicateGroups = available.has("flashcards")
    ? await db.$queryRawUnsafe<SqlRow[]>(`
        SELECT "normalizedTerm", COUNT(*) AS "recordCount"
        FROM "flashcards"
        GROUP BY "normalizedTerm"
        HAVING COUNT(*) > 1
        ORDER BY "normalizedTerm" ASC
      `)
    : [];
  const membershipCoverage = available.has("deck_vocabulary_memberships")
    ? await db.$queryRawUnsafe<SqlRow[]>(`
        SELECT
          (SELECT COUNT(*) FROM "flashcards" WHERE "deckId" IS NOT NULL) AS "legacyDeckCards",
          (SELECT COUNT(*) FROM "deck_vocabulary_memberships") AS "memberships",
          (SELECT COUNT(*)
             FROM "flashcards" AS "f"
             WHERE "f"."deckId" IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM "deck_vocabulary_memberships" AS "m"
                 WHERE "m"."deckId" = "f"."deckId" AND "m"."flashcardId" = "f"."id"
               )) AS "legacyDeckCardsMissingMembership"
      `)
    : [];
  const integrity = await db.$queryRawUnsafe<SqlRow[]>("PRAGMA integrity_check");
  const foreignKeyViolations = await db.$queryRawUnsafe<SqlRow[]>("PRAGMA foreign_key_check");
  const migrations = available.has("_prisma_migrations")
    ? await db.$queryRawUnsafe<SqlRow[]>(`
        SELECT "migration_name", "finished_at", "rolled_back_at"
        FROM "_prisma_migrations" ORDER BY "started_at" ASC
      `)
    : [];

  console.log(JSON.stringify(canonicalize({
    capturedAt: new Date().toISOString(),
    databaseUrl: process.env.DATABASE_URL ?? null,
    tableSnapshots,
    flashcardSchedulerHash: hash(schedulerRows),
    duplicateGroups,
    membershipCoverage: membershipCoverage[0]
      ? {
          legacyDeckCards: scalar(membershipCoverage[0], "legacyDeckCards"),
          memberships: scalar(membershipCoverage[0], "memberships"),
          legacyDeckCardsMissingMembership: scalar(membershipCoverage[0], "legacyDeckCardsMissingMembership"),
        }
      : null,
    integrity,
    foreignKeyViolations,
    migrations,
  }), null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
