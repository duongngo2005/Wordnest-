import { db } from "@/lib/db";
import { normalizeVocabularyTerm } from "@/lib/vocabulary/term-normalization";

async function main() {
  const cards = await db.flashcard.findMany({
    select: {
      id: true,
      term: true,
      normalizedTerm: true,
      meaningVi: true,
      partOfSpeech: true,
      deckMemberships: {
        select: { deck: { select: { name: true, folder: { select: { name: true } } } } },
      },
      _count: { select: { reviewLogs: true, practiceAttempts: true } },
    },
    orderBy: [{ normalizedTerm: "asc" }, { createdAt: "asc" }],
  });

  const byIdentity = new Map<string, typeof cards>();
  const normalizationMismatches: Array<{ id: string; term: string; stored: string; canonical: string }> = [];
  for (const card of cards) {
    const canonical = normalizeVocabularyTerm(card.term);
    if (card.normalizedTerm !== canonical) {
      normalizationMismatches.push({ id: card.id, term: card.term, stored: card.normalizedTerm, canonical });
    }
    const group = byIdentity.get(canonical) ?? [];
    group.push(card);
    byIdentity.set(canonical, group);
  }

  const duplicateGroups = [...byIdentity.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([normalizedTerm, group]) => ({
      normalizedTerm,
      records: group.map((card) => ({
        id: card.id,
        term: card.term,
        meaningVi: card.meaningVi,
        partOfSpeech: card.partOfSpeech,
        sources: card.deckMemberships.map(({ deck }) => ({
          collection: deck.folder?.name ?? null,
          deck: deck.name,
        })),
        reviewLogCount: card._count.reviewLogs,
        practiceAttemptCount: card._count.practiceAttempts,
      })),
    }));

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalFlashcards: cards.length,
    duplicateGroupCount: duplicateGroups.length,
    duplicateRecordCount: duplicateGroups.reduce((count, group) => count + group.records.length - 1, 0),
    normalizationMismatchCount: normalizationMismatches.length,
    duplicateGroups,
    normalizationMismatches,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
