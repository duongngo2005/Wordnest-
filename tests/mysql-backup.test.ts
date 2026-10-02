import { describe, expect, it } from "vitest";

import { buildMySqlDumpArguments, parseMySqlConnection } from "../src/lib/database/mysql-backup";

describe("parseMySqlConnection", () => {
  it("reads a percent-encoded MySQL connection URL without exposing its password", () => {
    const connection = parseMySqlConnection("mysql://backup-user:pa%24%24word@db.example:3307/wordnest");

    expect(connection).toEqual({
      host: "db.example",
      port: "3307",
      user: "backup-user",
      password: "pa$$word",
      database: "wordnest",
    });
  });

  it("rejects a connection URL without a database name", () => {
    expect(() => parseMySqlConnection("mysql://backup-user:password@db.example")).toThrow(
      "must include host and database name"
    );
  });
});

describe("buildMySqlDumpArguments", () => {
  it("creates an importable, consistent backup of one database", () => {
    expect(
      buildMySqlDumpArguments({
        host: "db.example",
        port: "3307",
        user: "backup-user",
        password: "unused-here",
        database: "wordnest",
      })
    ).toEqual([
      "--protocol=TCP",
      "--host=db.example",
      "--port=3307",
      "--user=backup-user",
      "--single-transaction",
      "--routines",
      "--events",
      "--triggers",
      "--hex-blob",
      "--no-tablespaces",
      "--default-character-set=utf8mb4",
      "--set-gtid-purged=OFF",
      "--databases",
      "wordnest",
    ]);
  });
});
