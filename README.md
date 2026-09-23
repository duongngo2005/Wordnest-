# WordNest

WordNest is a personal English vocabulary app. Its v1 daily loop is intentionally small:

**Add vocabulary → browse flashcards → scheduled review → practice → retry mistakes → focused practice.**

## Core v1

- Create cards manually (term + Vietnamese meaning is enough) or paste a batch.
- Review cards on the scheduled-review queue.
- Practice with multiple choice and typed Vietnamese → English recall, then retry mistakes.
- Use **Cần luyện thêm** and **Luyện tập trung** as transparent, read-only views of recent practice evidence.
- Audio and images remain optional aids on individual cards.

`FSRS` owns *when* a card is scheduled. `PracticeAttempt` records retrieval evidence; practice does not change FSRS scheduling.

## Optional / advanced tools

JSON import remains available under **More**; CSV export is a secondary data-portability action. AI card generation, Story creation, contextual translation, Story Cloze, Free Practice and the detailed Progress view are parked outside the daily loop. Document import, CSV import and the external Story bridge are retired. Existing Stories and their historical practice evidence remain readable. Manual creation, editing, review and practice work without an AI provider.

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
