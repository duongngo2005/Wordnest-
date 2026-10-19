import { PrismaClient } from "@prisma/client";

export const requiredV13Migrations = [
  "20261009120000_shared_vocabulary_memberships",
  "20261009120100_legacy_deck_membership_compatibility",
  "20261009120200_deck_artifact_retention",
  "20261018000000_daily_online_activity",
] as const;

export function getMissingV13Migrations(appliedMigrationNames: readonly string[]): string[] {
  const applied = new Set(appliedMigrationNames);
  return requiredV13Migrations.filter((migration) => !applied.has(migration));
}

export async function readMissingV13Migrations(): Promise<string[]> {
  const prisma = new PrismaClient();

  try {
    const migrations = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      'SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL',
    );
    return getMissingV13Migrations(migrations.map((migration) => migration.migration_name));
  } finally {
    await prisma.$disconnect();
  }
}
