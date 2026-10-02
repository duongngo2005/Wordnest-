import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const databasePath = path.resolve(process.cwd(), "prisma/vitest.db");
const databaseUrl = "file:./vitest.db";

export default function setupVitestDatabase(): () => void {
  rmSync(databasePath, { force: true });
  execFileSync(
    "npx",
    [
      "prisma",
      "db",
      "execute",
      "--schema",
      "prisma/schema.prisma",
      "--file",
      "prisma/migrations/20261003000000_sqlite_baseline/migration.sql",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    }
  );

  return () => rmSync(databasePath, { force: true });
}
