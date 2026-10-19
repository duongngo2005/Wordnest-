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

### Local Ollama and Kokoro voices

WordNest generates flashcards, stories, contextual translations, and curated audio on the same Ubuntu machine. The included [docker-compose.local-ai.yml](docker-compose.local-ai.yml) binds both services to loopback only, so they cannot be reached from another device on the network.

```bash
docker compose -f docker-compose.local-ai.yml up -d
docker compose -f docker-compose.local-ai.yml exec ollama ollama pull gemma3:4b
```

Use the same model tag in `.env.local` (or change both commands to a model you have chosen):

```bash
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="gemma3:4b"

KOKORO_TTS_BASE_URL="http://127.0.0.1:8000"
```

Ollama and Kokoro are the only configured generation providers. The initial Kokoro start downloads its local model files into the Docker volume; later starts reuse that cache. The app's own MP3 cache remains in `.wordnest-cache/tts` by default.

Check the local services before starting WordNest:

```bash
curl http://127.0.0.1:11434/api/tags
curl http://127.0.0.1:8000/healthz
```

Audio is cached on this self-hosted app at `.wordnest-cache/tts` by default. Set `TTS_CACHE_DIR` to a persistent writable directory when the app is hosted elsewhere.

### Durable AI generation worker

AI flashcard batches are persisted before the browser receives its `202 Accepted`
response. A separate worker process owns model execution; the web server must
not be relied on to keep an unawaited request alive.

Apply forward-only migrations before upgrading a running installation:

```bash
DATABASE_URL="file:./wordnest.db" npx prisma migrate deploy
```

`npm run dev` and `npm run start` use the included launcher, which starts a
separate Next.js child process and a separate AI-worker child process together.
If either exits, the launcher exits so a service manager can restart the pair:

```bash
npm run dev
```

For a local Ubuntu production process manager, build first, then supervise the
launcher (for example with systemd):

```bash
npm run build
npm run start
```

For debugging, the worker may instead be run independently with `npm run
worker:ai` alongside a direct Next.js command. Do not start two workers unless
testing recovery: the SQLite claim/lease is safe across processes, but one
worker is the intended local deployment.

The SQLite queue permits one active local-model lease across web and worker
processes for Story and Lesson work. If a worker stops, an expired lease is
fenced before work is safely recovered. The worker cannot run while the computer
is powered off.

To create flashcards with AI, open a deck and use **Thêm thẻ → JSON** to generate
the External AI V3 prompt, then paste the returned JSON for validation, duplicate
review, and import. This workflow does not require Ollama to be online.
