import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadEnvConfig } from "@next/env";

import { buildMySqlDumpArguments, parseMySqlConnection } from "../src/lib/database/mysql-backup";

function main(): void {
  loadEnvConfig(process.cwd());
  const connection = readMySqlConnection();
  const outputPath = getOutputPath(process.argv.slice(2));

  mkdirSync(dirname(outputPath), { recursive: true });
  writeMySqlDump(outputPath, connection);
  console.info(`MySQL backup written to ${outputPath}`);
}

function readMySqlConnection() {
  const value = process.env.MYSQL_DATABASE_URL?.trim();
  if (!value) {
    throw new Error("MYSQL_DATABASE_URL is required. It must remain separate from SQLite DATABASE_URL.");
  }

  return parseMySqlConnection(value);
}

function getOutputPath(argumentsFromCommandLine: string[]): string {
  if (argumentsFromCommandLine.length > 1) {
    throw new Error("Pass at most one output path: npm run db:export:mysql -- [path-to-backup.sql]");
  }

  return resolve(argumentsFromCommandLine[0] ?? `backups/wordnest-mysql-${backupTimestamp()}.sql`);
}

function backupTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeMySqlDump(outputPath: string, connection: ReturnType<typeof readMySqlConnection>): void {
  const outputFileDescriptor = openSync(outputPath, "wx");
  let mustDeletePartialBackup = true;

  try {
    const result = spawnSync("mysqldump", buildMySqlDumpArguments(connection), {
      encoding: "utf8",
      env: { ...process.env, MYSQL_PWD: connection.password },
      stdio: ["ignore", outputFileDescriptor, "pipe"],
    });
    if (result.error) {
      throw new Error(`Unable to start mysqldump: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`MySQL export failed: ${result.stderr?.trim() || "mysqldump exited without an error message"}`);
    }

    mustDeletePartialBackup = false;
  } finally {
    closeSync(outputFileDescriptor);
    if (mustDeletePartialBackup) rmSync(outputPath, { force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
