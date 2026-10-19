#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Validate the actual configured datasource before Next.js or the AI worker can
# open it. The launcher repeats this check, but failing here keeps host startup
# output concise and prevents an incompatible code/database pair from running.
node --import tsx - <<'NODE'
import { createRequire } from "node:module";
import path from "node:path";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
const { loadEnvConfig } = requireFromRoot("@next/env");
loadEnvConfig(process.cwd(), true);

const { readMissingV13Migrations } = await import("./scripts/wordnest-schema-preflight.ts");
const missing = await readMissingV13Migrations();
if (missing.length > 0) {
  throw new Error(`Refusing startup: pending V1.3 migrations: ${missing.join(", ")}`);
}
NODE

if [ "${1:-}" = "--check" ]; then
  exit 0
fi

exec npm run dev -- "$@"
