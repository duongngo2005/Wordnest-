# WordNest V1.3 production migration and rollback

This runbook applies only after explicit approval to migrate the active database.
It is forward-only: do not run `prisma migrate reset`, `prisma db push`, or a
manual schema repair against production.

## 1. Freeze writes and make a verified backup

The configured database is `prisma/wordnest.db` (`DATABASE_URL=file:./wordnest.db`).
Record the release code state and stop the WordNest launcher (which owns both
the web process and the AI worker) through its normal supervisor. For an
interactive `npm run start`, stop that foreground process with `Ctrl-C`.
Confirm there are no remaining launcher, Next, or AI-worker processes before
continuing.

```bash
cd /home/dinduong/PROJECTS/Wordnest-
export V13_PREVIOUS_REVISION="$(git rev-parse HEAD)"
export V13_BACKUP_DIR="$PWD/backups"
export V13_RELEASE_STAMP="REPLACE_WITH_UTC_TIMESTAMP"
export V13_CODE_ARCHIVE="$V13_BACKUP_DIR/wordnest-pre-v13-code-${V13_PREVIOUS_REVISION:0:12}-$V13_RELEASE_STAMP.tar"
export V13_RELEASE_PATCH="$V13_BACKUP_DIR/wordnest-v13-release-worktree-$V13_RELEASE_STAMP.patch"
export V13_RELEASE_TREE="$V13_BACKUP_DIR/wordnest-v13-release-tree-$V13_RELEASE_STAMP.tar"
mkdir -p "$V13_BACKUP_DIR"
test ! -e "$V13_CODE_ARCHIVE"
test ! -e "$V13_RELEASE_TREE"
git archive --format=tar --output="$V13_CODE_ARCHIVE" "$V13_PREVIOUS_REVISION"
tar --delete --file="$V13_CODE_ARCHIVE" prisma/wordnest.db
git diff --binary --no-ext-diff > "$V13_RELEASE_PATCH"
tar \
  --exclude=.git --exclude=.aws --exclude=node_modules --exclude=.next --exclude=backups --exclude=test-results \
  --exclude=.env --exclude='.env.*' --exclude='prisma/wordnest.db' --exclude='prisma/wordnest.db-*' \
  -cf "$V13_RELEASE_TREE" .
sha256sum "$V13_CODE_ARCHIVE" "$V13_RELEASE_PATCH" "$V13_RELEASE_TREE"
ps -eo pid=,command= | rg 'wordnest-launcher|next-server|ai-worker' || true
```

Create a new timestamped target name that does not already exist, then take a
consistent SQLite online backup. This Python standard-library command handles
WAL correctly; it must run while writers are stopped.

```bash
export V13_SOURCE_DB="$PWD/prisma/wordnest.db"
export V13_BACKUP="$V13_BACKUP_DIR/wordnest-v13-predeploy-REPLACE_WITH_UTC_TIMESTAMP.db"
test -f "$V13_SOURCE_DB"
test ! -e "$V13_BACKUP"
python3 - "$V13_SOURCE_DB" "$V13_BACKUP" <<'PY'
import sqlite3, sys
source, target = sys.argv[1:]
reader = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
writer = sqlite3.connect(target)
reader.backup(writer)
writer.close()
reader.close()
PY
sha256sum "$V13_BACKUP"
DATABASE_URL="file:$V13_SOURCE_DB" node --import tsx scripts/capture-v13-integrity.ts > "$V13_BACKUP.before.json"
DATABASE_URL="file:$V13_BACKUP" node --import tsx scripts/capture-v13-integrity.ts > "$V13_BACKUP.backup.json"
```

Review both JSON snapshots. They must report `integrity_check: ok`, an empty
`foreignKeyViolations` list, and matching protected record hashes. Keep the
database backup, both snapshots, the pre-V1.3 code archive, and the working-tree
patch in `backups/`; never place them in `/tmp` or in the `prisma/` directory.

## 2. Apply the verified migrations

Only the following pending migrations are expected:

1. `20261009120000_shared_vocabulary_memberships`
2. `20261009120100_legacy_deck_membership_compatibility`
3. `20261009120200_deck_artifact_retention`

```bash
DATABASE_URL="file:$V13_SOURCE_DB" npx prisma migrate status --schema prisma/schema.prisma
DATABASE_URL="file:$V13_SOURCE_DB" npx prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL="file:$V13_SOURCE_DB" npx prisma migrate status --schema prisma/schema.prisma
DATABASE_URL="file:$V13_SOURCE_DB" node --import tsx scripts/capture-v13-integrity.ts > "$V13_BACKUP.after.json"
DATABASE_URL="file:$V13_SOURCE_DB" npm run audit:global-vocabulary > "$V13_BACKUP.global-vocabulary-after.json"
```

Do not mark a failed migration as resolved. Leave the application stopped and
use the rollback section instead.

## 3. Verify preservation before restart

Compare the protected records and scheduling state. The membership table and
the migration list intentionally change; all other listed records must match.

```bash
python3 - "$V13_BACKUP.before.json" "$V13_BACKUP.after.json" <<'PY'
import json, sys
before, after = (json.load(open(path)) for path in sys.argv[1:])
protected = before["tableSnapshots"].keys()
for table in protected:
    if before["tableSnapshots"].get(table) != after["tableSnapshots"].get(table):
        raise SystemExit(f"preservation mismatch: {table}")
for field in ("flashcardSchedulerHash", "duplicateGroups", "integrity", "foreignKeyViolations"):
    if before.get(field) != after.get(field):
        raise SystemExit(f"preservation mismatch: {field}")
coverage = after.get("membershipCoverage") or {}
if coverage.get("legacyDeckCardsMissingMembership") != 0:
    raise SystemExit("legacy deck membership backfill is incomplete")
print("V1.3 protected-data comparison passed")
PY
```

Specifically confirm that the only duplicate group is the known historical
`productive` group and that it still contains its two original card IDs. The
comparison must not be replaced with a comparison to an old card-count report;
the pre-deploy snapshot is authoritative.

## 4. Restart and non-destructive smoke test

Build the verified working tree, start it with the normal supervisor, then use
only read-only navigation and import preview checks against production.

```bash
npm run build
npm run start
```

Confirm that the app and AI worker start without migration errors, then open an
existing collection and deck, an existing card’s learning history, the
unassigned-vocabulary route, and an External AI V3 import preview. Do not run
deck/collection deletion or save disposable test data against a user’s live
learning set.

## 5. Roll back application and database together

If any migration or post-migration preservation check fails, keep WordNest and
the worker stopped. Preserve the failed database and every diagnostic JSON
file. Restore the matching pre-V1.3 database and the pre-deploy code revision
together; never run old code against the V1.3 schema or new code against the
old schema.

```bash
export V13_FAILED_DB="$V13_SOURCE_DB.failed-REPLACE_WITH_UTC_TIMESTAMP"
test -f "$V13_BACKUP"
test ! -e "$V13_FAILED_DB"
mv "$V13_SOURCE_DB" "$V13_FAILED_DB"
test ! -e "$V13_SOURCE_DB-wal" || mv "$V13_SOURCE_DB-wal" "$V13_FAILED_DB-wal"
test ! -e "$V13_SOURCE_DB-shm" || mv "$V13_SOURCE_DB-shm" "$V13_FAILED_DB-shm"
cp "$V13_BACKUP" "$V13_SOURCE_DB"
DATABASE_URL="file:$V13_SOURCE_DB" node --import tsx scripts/capture-v13-integrity.ts
```

Extract the recorded `wordnest-pre-v13-code-*.tar` archive into a separate,
clean rollback directory, install its dependencies, rebuild it, and start it
with the restored database. This works even when the deployment worktree has
uncommitted changes. Do not use `git reset --hard` in a dirty deployment
checkout. After the restored snapshot passes integrity and foreign-key checks,
restart the matching pre-V1.3 application version.
