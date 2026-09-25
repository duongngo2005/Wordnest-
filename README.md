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
npx prisma migrate status
npm run typecheck
npm run lint
npm run build
npx vitest run
npx playwright test
```

The app uses Next.js, TypeScript, Prisma/MySQL, Vitest and Playwright. Preserve Prisma migration history; do not reset or `db push` around migrations.

### Optional WordNest voices

System speech works without any cloud setup. To enable the curated WordNest voices, set these **server-only** environment variables (never `NEXT_PUBLIC_*`):

```bash
AZURE_SPEECH_KEY="..."
AZURE_SPEECH_REGION="eastus"
```

Audio is cached on this self-hosted app at `.wordnest-cache/tts` by default. Set `TTS_CACHE_DIR` to a persistent writable directory when the app is hosted elsewhere.
