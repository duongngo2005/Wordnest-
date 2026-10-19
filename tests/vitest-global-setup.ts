import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";

const databasePath = path.resolve(process.cwd(), "prisma/vitest.db");
const databaseUrl = "file:./vitest.db";

export default function setupVitestDatabase(): () => void {
  rmSync(databasePath, { force: true });
  const migrations = readdirSync(path.resolve(process.cwd(), "prisma/migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations) {
    execFileSync(
      "npx",
      [
        "prisma", "db", "execute", "--schema", "prisma/schema.prisma",
        "--file", `prisma/migrations/${migration}/migration.sql`,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "inherit",
      }
    );
  }

  return () => rmSync(databasePath, { force: true });
}
