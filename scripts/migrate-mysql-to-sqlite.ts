import { loadEnvConfig } from "@next/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";

import {
  assertMatchingTableDigests,
  createTableDigest,
  parseMySqlDateTime,
} from "../src/lib/database/mysql-to-sqlite-integrity";

const COPY_BATCH_SIZE = 250;
const MAX_MYSQL_EXPORT_BYTES = 256 * 1024 * 1024;

type TableDefinition = {
  tableName: string;
  delegateName: string;
  columns: string[];
  dateColumns: string[];
  jsonColumns?: string[];
  booleanColumns?: string[];
};

type SourceSnapshot = Record<string, Record<string, unknown>[]>;

type WritableDelegate = {
  count(): Promise<number>;
  createMany(args: { data: unknown[] }): Promise<{ count: number }>;
  findMany(): Promise<Record<string, unknown>[]>;
};

const tables: TableDefinition[] = [
  {
    tableName: "folders",
    delegateName: "folder",
    columns: ["id", "name", "normalizedName", "description", "icon", "color", "position", "createdAt", "updatedAt"],
    dateColumns: ["createdAt", "updatedAt"],
  },
  {
    tableName: "decks",
    delegateName: "deck",
    columns: ["id", "name", "description", "folderId", "position", "createdAt", "updatedAt"],
    dateColumns: ["createdAt", "updatedAt"],
  },
  {
    tableName: "flashcards",
    delegateName: "flashcard",
    columns: [
      "id",
      "deckId",
      "term",
      "normalizedTerm",
      "meaningVi",
      "definitionEn",
      "ipa",
      "partOfSpeech",
      "cefr",
      "exampleEn",
      "exampleVi",
      "imageUrl",
      "imageSource",
      "imageSearchQuery",
      "imagePageUrl",
      "imageAuthor",
      "imageLicense",
      "status",
      "due",
      "lastReviewAt",
      "reps",
      "lapses",
      "stability",
      "difficulty",
      "elapsedDays",
      "scheduledDays",
      "learningSteps",
      "state",
      "schedulerVersion",
      "createdAt",
      "updatedAt",
    ],
    dateColumns: ["due", "lastReviewAt", "createdAt", "updatedAt"],
  },
  {
    tableName: "review_logs",
    delegateName: "reviewLog",
    columns: [
      "id",
      "cardId",
      "rating",
      "state",
      "due",
      "stability",
      "difficulty",
      "elapsedDays",
      "lastElapsedDays",
      "scheduledDays",
      "reviewEventId",
      "review",
      "createdAt",
    ],
    dateColumns: ["due", "review", "createdAt"],
  },
  {
    tableName: "stories",
    delegateName: "story",
    columns: ["id", "deckId", "title", "content", "cefr", "length", "topic", "targetWords", "createdAt", "updatedAt"],
    dateColumns: ["createdAt", "updatedAt"],
    jsonColumns: ["targetWords"],
  },
  {
    tableName: "quiz_attempts",
    delegateName: "quizAttempt",
    columns: ["id", "deckId", "score", "total", "accuracy", "createdAt"],
    dateColumns: ["createdAt"],
  },
  {
    tableName: "quiz_sessions",
    delegateName: "quizSession",
    columns: ["id", "deckId", "questions", "expiresAt", "createdAt"],
    dateColumns: ["expiresAt", "createdAt"],
    jsonColumns: ["questions"],
  },
  {
    tableName: "practice_attempts",
    delegateName: "practiceAttempt",
    columns: [
      "id",
      "flashcardId",
      "sessionId",
      "questionId",
      "prompt",
      "attemptNumber",
      "mode",
      "questionType",
      "correct",
      "answer",
      "expectedAnswer",
      "responseMs",
      "createdAt",
    ],
    dateColumns: ["createdAt"],
    booleanColumns: ["correct"],
  },
];

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const sourceUrl = requireMySqlSourceUrl();
  const sqlite = new PrismaClient({ log: ["error"] });

  try {
    const sourceSchema = readSourceSchema(sourceUrl);
    assertSourceSchemaMatchesApplication(sourceSchema);
    await assertDestinationIsEmpty(sqlite);

    const sourceSnapshot = readSourceSnapshot(sourceUrl);
    await writeSnapshot(sqlite, sourceSnapshot);
    await assertSnapshotWasCopied(sqlite, sourceSnapshot);

    console.info("MySQL data copied and integrity-verified in SQLite. The MySQL source was not modified.");
  } finally {
    await sqlite.$disconnect();
  }
}

function requireMySqlSourceUrl(): URL {
  const value = process.env.MYSQL_DATABASE_URL?.trim();
  if (!value) {
    throw new Error("MYSQL_DATABASE_URL is required. It must remain separate from SQLite DATABASE_URL.");
  }

  const sourceUrl = new URL(value);
  if (sourceUrl.protocol !== "mysql:") {
    throw new Error("MYSQL_DATABASE_URL must use the mysql:// protocol.");
  }
  if (!sourceUrl.hostname || !sourceUrl.pathname || sourceUrl.pathname === "/") {
    throw new Error("MYSQL_DATABASE_URL must include host and database name.");
  }

  return sourceUrl;
}

function readSourceSchema(sourceUrl: URL): Map<string, string[]> {
  const columnRows = runMySqlJsonQuery(
    sourceUrl,
    "SELECT JSON_ARRAYAGG(JSON_OBJECT('tableName', table_name, 'columnName', column_name)) FROM information_schema.columns WHERE table_schema = DATABASE()"
  ) as unknown[];
  const sourceSchema = new Map<string, string[]>();

  for (const columnRow of columnRows) {
    const row = asRecord(columnRow, "source schema row");
    const tableName = asString(row.tableName, "source schema table name");
    const columnName = asString(row.columnName, "source schema column name");
    sourceSchema.set(tableName, [...(sourceSchema.get(tableName) ?? []), columnName]);
  }

  return sourceSchema;
}

function assertSourceSchemaMatchesApplication(sourceSchema: Map<string, string[]>): void {
  const expectedTables = new Set(tables.map((table) => table.tableName));
  const unexpectedTables = [...sourceSchema.keys()].filter(
    (tableName) => !expectedTables.has(tableName) && !tableName.startsWith("_")
  );

  if (unexpectedTables.length > 0) {
    throw new Error(`Source contains unsupported tables that would not be copied: ${unexpectedTables.join(", ")}.`);
  }

  for (const table of tables) {
    const actualColumns = sourceSchema.get(table.tableName);
    if (!actualColumns) throw new Error(`Source table ${table.tableName} is missing.`);

    const unexpectedColumns = actualColumns.filter((column) => !table.columns.includes(column));
    const missingColumns = table.columns.filter((column) => !actualColumns.includes(column));
    if (unexpectedColumns.length > 0 || missingColumns.length > 0) {
      throw new Error(
        `Source schema differs for ${table.tableName}. Missing: ${missingColumns.join(", ") || "none"}; unexpected: ${unexpectedColumns.join(", ") || "none"}.`
      );
    }
  }
}

async function assertDestinationIsEmpty(sqlite: PrismaClient): Promise<void> {
  for (const table of tables) {
    const rowCount = await getDelegate(sqlite, table.delegateName).count();
    if (rowCount !== 0) {
      throw new Error(`SQLite destination already contains ${rowCount} ${table.tableName} rows. Refusing to overwrite data.`);
    }
  }
}

function readSourceSnapshot(sourceUrl: URL): SourceSnapshot {
  const selectFields = tables
    .map((table) => `'${table.tableName}', ${buildTableSnapshotSelect(table)}`)
    .join(", ");
  const exportValue = runMySqlJsonQuery(sourceUrl, `SELECT JSON_OBJECT(${selectFields})`) as unknown;
  const exportRecord = asRecord(exportValue, "MySQL snapshot");

  return Object.fromEntries(
    tables.map((table) => [table.tableName, normalizeSourceRows(table, exportRecord[table.tableName])])
  );
}

function buildTableSnapshotSelect(table: TableDefinition): string {
  const fields = table.columns
    .map((column) => `'${column}', ${buildColumnExpression(table, column)}`)
    .join(", ");
  return `COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT(${fields})) FROM \`${table.tableName}\`), JSON_ARRAY())`;
}

function buildColumnExpression(table: TableDefinition, column: string): string {
  if (table.dateColumns.includes(column)) {
    return `DATE_FORMAT(\`${column}\`, '%Y-%m-%d %H:%i:%s.%f')`;
  }
  if (table.jsonColumns?.includes(column)) {
    return `JSON_EXTRACT(\`${column}\`, '$')`;
  }
  return `\`${column}\``;
}

function normalizeSourceRows(table: TableDefinition, value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`MySQL snapshot for ${table.tableName} is not an array.`);

  return value.map((rawRow) => {
    const row = asRecord(rawRow, `MySQL row in ${table.tableName}`);
    assertExactColumns(table, row);

    for (const column of table.dateColumns) {
      if (row[column] !== null) row[column] = parseMySqlDateTime(asString(row[column], `${table.tableName}.${column}`));
    }
    for (const column of table.booleanColumns ?? []) {
      row[column] = toBoolean(row[column], `${table.tableName}.${column}`);
    }

    return row;
  });
}

async function writeSnapshot(sqlite: PrismaClient, sourceSnapshot: SourceSnapshot): Promise<void> {
  await sqlite.$transaction(
    async (transaction) => {
      for (const table of tables) {
        const rows = sourceSnapshot[table.tableName] ?? [];
        await writeTableInBatches(getDelegate(transaction, table.delegateName), rows);
      }
    },
    { maxWait: 5_000, timeout: 60_000 }
  );
}

async function writeTableInBatches(delegate: WritableDelegate, rows: Record<string, unknown>[]): Promise<void> {
  for (let index = 0; index < rows.length; index += COPY_BATCH_SIZE) {
    await delegate.createMany({ data: rows.slice(index, index + COPY_BATCH_SIZE) });
  }
}

async function assertSnapshotWasCopied(sqlite: PrismaClient, sourceSnapshot: SourceSnapshot): Promise<void> {
  for (const table of tables) {
    const sourceRows = sourceSnapshot[table.tableName] ?? [];
    const destinationRows = await getDelegate(sqlite, table.delegateName).findMany();
    if (sourceRows.length !== destinationRows.length) {
      throw new Error(
        `Integrity verification failed for ${table.tableName}: expected ${sourceRows.length} rows, found ${destinationRows.length}.`
      );
    }
    assertMatchingTableDigests(table.tableName, createTableDigest(sourceRows), createTableDigest(destinationRows));
  }
}

function runMySqlJsonQuery(sourceUrl: URL, query: string): unknown {
  const source = readMySqlConnection(sourceUrl);
  const result = spawnSync(
    "mysql",
    [
      "--protocol=TCP",
      `--host=${source.host}`,
      `--port=${source.port}`,
      `--user=${source.user}`,
      `--database=${source.database}`,
      "--batch",
      "--raw",
      "--skip-column-names",
      "--silent",
      "--default-character-set=utf8mb4",
      `--execute=${query}`,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, MYSQL_PWD: source.password },
      maxBuffer: MAX_MYSQL_EXPORT_BYTES,
    }
  );

  if (result.error) throw new Error(`Unable to start mysql client: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`MySQL read failed: ${result.stderr.trim() || "mysql exited without an error message"}`);
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`MySQL returned invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function readMySqlConnection(sourceUrl: URL): { host: string; port: string; user: string; password: string; database: string } {
  return {
    host: sourceUrl.hostname,
    port: sourceUrl.port || "3306",
    user: decodeURIComponent(sourceUrl.username),
    password: decodeURIComponent(sourceUrl.password),
    database: decodeURIComponent(sourceUrl.pathname.slice(1)),
  };
}

function getDelegate(client: PrismaClient | Prisma.TransactionClient, delegateName: string): WritableDelegate {
  const delegate = (client as unknown as Record<string, unknown>)[delegateName];
  if (!delegate || typeof delegate !== "object") throw new Error(`Prisma delegate ${delegateName} is unavailable.`);
  return delegate as WritableDelegate;
}

function assertExactColumns(table: TableDefinition, row: Record<string, unknown>): void {
  const receivedColumns = Object.keys(row).sort();
  const expectedColumns = [...table.columns].sort();
  if (receivedColumns.join("\u0000") !== expectedColumns.join("\u0000")) {
    throw new Error(`MySQL row columns differ from the expected ${table.tableName} schema.`);
  }
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as Record<string, unknown>;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string.`);
  return value;
}

function toBoolean(value: unknown, name: string): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new Error(`${name} must be a boolean.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
