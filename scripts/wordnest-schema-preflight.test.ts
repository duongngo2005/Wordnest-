import { describe, expect, it } from "vitest";
import { getMissingV13Migrations, requiredV13Migrations } from "./wordnest-schema-preflight";

describe("WordNest V1.3 schema preflight", () => {
  it("reports every required migration when a legacy database has none", () => {
    expect(getMissingV13Migrations([])).toEqual(requiredV13Migrations);
  });

  it("reports only the unapplied migration", () => {
    expect(getMissingV13Migrations(requiredV13Migrations.slice(0, -1))).toEqual([
      "20261018000000_daily_online_activity",
    ]);
  });

  it("allows startup only when every required migration is applied", () => {
    expect(getMissingV13Migrations([...requiredV13Migrations, "unrelated_migration"])).toEqual([]);
  });

  it("requires the daily online-activity ledger before startup", () => {
    expect(requiredV13Migrations).toContain("20261018000000_daily_online_activity");
  });
});
