# WordNest

WordNest is a personal English vocabulary app. Its v1 daily loop is intentionally small:

**Add vocabulary → browse flashcards → scheduled review → practice → retry mistakes → focused practice.**

## Core v1

- Create cards manually (term + Vietnamese meaning is enough), with optional AI generation or strict JSON import inside a Deck.
- Review cards on the scheduled-review queue.
- Practice with multiple choice and typed Vietnamese → English recall, then retry mistakes.
- Use **Cần luyện thêm** and **Luyện tập trung** as transparent, read-only views of recent practice evidence.
- Audio and images remain optional aids on individual cards.

`FSRS` owns *when* a card is scheduled. `PracticeAttempt` records retrieval evidence; practice does not change FSRS scheduling.

## Optional / advanced tools

AI generation is an optional Deck-level convenience; manual entry and JSON import work without any provider credentials. CSV export stays in a Deck’s utility menu. Story creation, contextual translation, Story Cloze and Free Practice remain optional, while Progress is a first-class product destination. Document import, CSV import and the external Story bridge are retired. Existing Stories and their historical practice evidence remain readable.

## Development

```bash
npm run dev
npx prisma validate
npm run db:push
npm run typecheck
npm run lint
npm run build
npx vitest run
npx playwright test
```

The app uses Next.js, TypeScript, Prisma/SQLite, Vitest and Playwright. `DATABASE_URL` is a local SQLite file; do not use `prisma migrate reset` against a database that contains your study history.

The repository intentionally includes `prisma/wordnest.db`, the shared WordNest data snapshot. After cloning on another machine, copy `.env.example` to `.env` (or set `DATABASE_URL="file:./wordnest.db"`) before starting the app. Treat changes to this file as data changes: coordinate before pushing a replacement snapshot, because SQLite files cannot be meaningfully merged in Git.

### One-time MySQL to SQLite transfer

The transfer creates and verifies a fresh SQLite file. It never writes to or deletes the MySQL source. It checks the exact current app schema, copies all eight application tables in a single SQLite transaction, then compares a normalized SHA-256 digest of every field in every row.

First, retain a MySQL backup and ensure the app is stopped so the source does not change while it is copied. Configure both URLs in `.env.local`; `DATABASE_URL` is the new local destination and `MYSQL_DATABASE_URL` is read by the transfer command only:

```bash
DATABASE_URL="file:./wordnest.db"
MYSQL_DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/wordnest"
```

Then create an empty SQLite schema and copy the data:

```bash
npm run db:push
npm run db:migrate:mysql-to-sqlite
```

The command refuses to overwrite a non-empty SQLite database, rejects schema mismatches or extra application tables, and rolls back the whole SQLite write if any insert fails. MySQL-specific migration SQL is retained under `prisma/mysql-migrations-archive`; SQLite starts from its own baseline migration.

### MySQL backup for transfer or recovery

To create an importable backup of the complete MySQL database (schema, data, triggers, routines, and events), set `MYSQL_DATABASE_URL` in `.env.local` and run:

```bash
npm run db:export:mysql
```

The command writes a timestamped `.sql` file under `backups/`; backups are deliberately ignored by Git. The source database is never modified. To choose an explicit filename:

```bash
npm run db:export:mysql -- backups/wordnest-2026-10-02.sql
```

Copy that file to another machine and import it with a MySQL account that can create the database:

```bash
mysql --host=HOST --port=3306 --user=USER --password < backups/wordnest-2026-10-02.sql
```

### Local Ollama and Kokoro voices

WordNest can keep generated flashcards, stories, contextual translation, and curated audio entirely on the same Ubuntu machine. The included [docker-compose.local-ai.yml](docker-compose.local-ai.yml) binds both services to loopback only, so they cannot be reached from another device on the network.

```bash
docker compose -f docker-compose.local-ai.yml up -d
docker compose -f docker-compose.local-ai.yml exec ollama ollama pull gemma3:4b
```

Use the same model tag in `.env.local` (or change both commands to a model you have chosen):

```bash
AI_PROVIDER="ollama"
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="gemma3:4b"

TTS_PROVIDER="kokoro"
KOKORO_TTS_BASE_URL="http://127.0.0.1:8000"
```

`AI_PROVIDER="ollama"` never falls back to Gemini or OpenRouter. `TTS_PROVIDER="kokoro"` likewise never sends text to Azure. The initial Kokoro start downloads its local model files into the Docker volume; later starts reuse that cache. The app's own MP3 cache remains in `.wordnest-cache/tts` by default.

Check the local services before starting WordNest:

```bash
curl http://127.0.0.1:11434/api/tags
curl http://127.0.0.1:8000/healthz
```

### Optional Azure WordNest voices

System speech works without any cloud setup. To enable the curated WordNest voices, set these **server-only** environment variables (never `NEXT_PUBLIC_*`):

```bash
AZURE_SPEECH_KEY="..."
AZURE_SPEECH_REGION="eastus"
```

Audio is cached on this self-hosted app at `.wordnest-cache/tts` by default. Set `TTS_CACHE_DIR` to a persistent writable directory when the app is hosted elsewhere.
