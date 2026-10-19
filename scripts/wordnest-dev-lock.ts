import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";

type ProcessProbe = (pid: number) => boolean;

type ActiveDevLock = {
  kind: "active";
  pid: number;
  port: number;
  appUrl: string;
};

type StaleDevLock = {
  kind: "stale";
  lockPath: string;
  raw: string;
};

type UnrecognizedDevLock = {
  kind: "unrecognized";
  lockPath: string;
};

export type NextDevLockState = ActiveDevLock | StaleDevLock | UnrecognizedDevLock | { kind: "missing" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidLock(value: unknown): value is { pid: number; port: number; appUrl: string } {
  return isRecord(value)
    && Number.isInteger(value.pid)
    && typeof value.port === "number"
    && typeof value.appUrl === "string";
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw error;
  }
}

export function inspectNextDevLock(root: string, processProbe: ProcessProbe = isProcessRunning): NextDevLockState {
  const lockPath = path.join(root, ".next", "dev", "lock");
  if (!existsSync(lockPath)) return { kind: "missing" };

  try {
    const raw = readFileSync(lockPath, "utf8");
    const value: unknown = JSON.parse(raw);
    if (!isValidLock(value)) return { kind: "unrecognized", lockPath };

    return processProbe(value.pid)
      ? { kind: "active", pid: value.pid, port: value.port, appUrl: value.appUrl }
      : { kind: "stale", lockPath, raw };
  } catch {
    return { kind: "unrecognized", lockPath };
  }
}

export function clearStaleNextDevLock(lock: StaleDevLock): boolean {
  try {
    if (!existsSync(lock.lockPath)) return true;
    if (readFileSync(lock.lockPath, "utf8") !== lock.raw) return false;
    unlinkSync(lock.lockPath);
    return true;
  } catch {
    return false;
  }
}
