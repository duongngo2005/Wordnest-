import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { clearStaleNextDevLock, inspectNextDevLock } from "./wordnest-dev-lock";
import { readMissingV13Migrations } from "./wordnest-schema-preflight";

const requireFromLauncher = createRequire(path.join(process.cwd(), "package.json"));
const { loadEnvConfig } = requireFromLauncher("@next/env") as typeof import("@next/env");

const mode = process.argv[2] === "start" ? "start" : "dev";
const host = process.argv.includes("--host") ? ["-H", "0.0.0.0"] : [];
// Keep `npm run dev -- --port 3101` working for isolated browser tests. The
// launcher owns the optional host shorthand but forwards normal Next CLI flags.
const nextArgs = process.argv.slice(3).filter((arg) => arg !== "--" && arg !== "--host");
const root = process.cwd();
const nextDevLock = mode === "dev" ? inspectNextDevLock(root) : { kind: "missing" } as const;

async function launchWordNest() {
  // Next loads these files for its own process, but the independently spawned
  // worker only inherits process.env. Load once before forking so both children
  // receive the same DATABASE_URL and local-AI configuration.
  loadEnvConfig(root, mode === "dev");
  try {
    const missingMigrations = await readMissingV13Migrations();
    if (missingMigrations.length > 0) {
      console.error("[wordnest-launcher] WordNest V1.3 will not start because the configured database has pending required migrations:");
      for (const migration of missingMigrations) console.error(`  - ${migration}`);
      console.error("Apply them only through the approved production migration procedure; no migration was run.");
      process.exitCode = 1;
      return;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[wordnest-launcher] Could not verify the configured database schema: ${message}`);
    process.exitCode = 1;
    return;
  }

  const nextBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
  const tsxBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

  const sharedEnv = { ...process.env, WORDNEST_MANAGED_AI_WORKER: "1" };
  const next = spawn(nextBin, [mode, ...host, ...nextArgs], { stdio: "inherit", env: sharedEnv });
  const worker = spawn(tsxBin, ["src/workers/ai-worker.ts"], { stdio: "inherit", env: sharedEnv });
  const children: ChildProcess[] = [next, worker];
  let stopping = false;

  function stop(exitCode = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (!child.killed) child.kill("SIGTERM");
    }
    setTimeout(() => {
      for (const child of children) {
        if (!child.killed) child.kill("SIGKILL");
      }
      process.exit(exitCode);
    }, 5_000).unref();
  }

  process.once("SIGINT", () => stop(0));
  process.once("SIGTERM", () => stop(0));

  for (const child of children) {
    child.once("exit", (code, signal) => {
      if (stopping) return;
      console.error(`[wordnest-launcher] ${child === worker ? "AI worker" : "Next"} exited (${signal || (code ?? "unknown")}); stopping WordNest.`);
      stop(typeof code === "number" && code !== 0 ? code : 1);
    });
  }
}

if (nextDevLock.kind === "active") {
  console.log(`[wordnest-launcher] WordNest development server is already running at ${nextDevLock.appUrl} (PID ${nextDevLock.pid}).`);
  console.log("Use that server, or stop it before starting a launcher-managed worker.");
  process.exitCode = 0;
} else if (nextDevLock.kind === "unrecognized") {
  console.error(`[wordnest-launcher] Cannot safely inspect the existing Next development lock: ${nextDevLock.lockPath}`);
  process.exitCode = 1;
} else if (nextDevLock.kind === "stale" && !clearStaleNextDevLock(nextDevLock)) {
  console.error(`[wordnest-launcher] Could not clear the stale Next development lock: ${nextDevLock.lockPath}`);
  process.exitCode = 1;
} else {
  void launchWordNest();
}
