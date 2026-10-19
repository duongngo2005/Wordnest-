#!/usr/bin/env bash
set -euo pipefail

# Playwright's config starts Next.js itself. Requiring a clearly named clone
# keeps destructive V1.3 scenarios away from the live Prisma SQLite database.
: "${DATABASE_URL:?Set DATABASE_URL to an isolated SQLite test clone first.}"

case "${DATABASE_URL}" in
  *.test.db|*.test.db\?*) ;;
  *)
    echo "Refusing E2E run: DATABASE_URL must point to a *.test.db clone, not live data." >&2
    exit 64
    ;;
esac

export PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-3100}"
npx playwright test "$@"
