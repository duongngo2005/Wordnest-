import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearStaleNextDevLock, inspectNextDevLock } from "./wordnest-dev-lock";

const temporaryRoots: string[] = [];

function writeLock(pid: number) {
  const root = mkdtempSync(path.join(os.tmpdir(), "wordnest-dev-lock-"));
  temporaryRoots.push(root);
  const lockPath = path.join(root, ".next", "dev", "lock");
  mkdirSync(path.dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, JSON.stringify({ pid, port: 3000, appUrl: "http://localhost:3000" }));
  return { root, lockPath };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Next development lock handling", () => {
  it("removes a stale lock so a new WordNest dev server can start", () => {
    const { root, lockPath } = writeLock(13255);
    const state = inspectNextDevLock(root, () => false);

    expect(state.kind).toBe("stale");
    if (state.kind !== "stale") throw new Error("Expected the lock to be stale.");
    expect(state).toEqual({ kind: "stale", lockPath, raw: expect.any(String) });
    expect(clearStaleNextDevLock(state)).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("keeps a lock owned by a running development server", () => {
    const { root, lockPath } = writeLock(13255);
    const state = inspectNextDevLock(root, () => true);

    expect(state).toEqual({
      kind: "active",
      pid: 13255,
      port: 3000,
      appUrl: "http://localhost:3000",
    });
    expect(existsSync(lockPath)).toBe(true);
  });
});
