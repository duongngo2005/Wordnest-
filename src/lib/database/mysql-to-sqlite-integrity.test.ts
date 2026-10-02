import { describe, expect, it } from "vitest";

import {
  assertMatchingTableDigests,
  createTableDigest,
  parseMySqlDateTime,
} from "./mysql-to-sqlite-integrity";

describe("MySQL to SQLite integrity helpers", () => {
  it("produces the same digest when object keys and row order differ", () => {
    const sourceDigest = createTableDigest([
      { id: "b", nested: { z: 2, a: 1 } },
      { id: "a", nested: { answer: true } },
    ]);
    const destinationDigest = createTableDigest([
      { nested: { answer: true }, id: "a" },
      { nested: { a: 1, z: 2 }, id: "b" },
    ]);

    expect(destinationDigest).toBe(sourceDigest);
  });

  it("rejects a destination with changed data", () => {
    expect(() =>
      assertMatchingTableDigests("flashcards", createTableDigest([{ id: "card-1", term: "apple" }]), createTableDigest([{ id: "card-1", term: "pear" }]))
    ).toThrow("Integrity verification failed for flashcards");
  });

  it("preserves millisecond precision while converting MySQL UTC datetime text", () => {
    expect(parseMySqlDateTime("2026-10-03 13:47:12.345000").toISOString()).toBe("2026-10-03T13:47:12.345Z");
  });

  it("rejects invalid MySQL datetime text instead of silently changing it", () => {
    expect(() => parseMySqlDateTime("not-a-date")).toThrow("Invalid MySQL datetime");
  });
});
