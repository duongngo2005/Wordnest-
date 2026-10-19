import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { normalizeVocabularyTerm } from "@/lib/vocabulary/term-normalization";
import { deckService } from "./deck-service";

const deckIds = new Set<string>();

async function deck(name: string, folderId?: string) {
  const created = await db.deck.create({ data: { name, folderId } });
  deckIds.add(created.id);
  return created;
}

afterEach(async () => {
  for (const id of deckIds) await db.deck.delete({ where: { id } });
  deckIds.clear();
});

describe("global vocabulary identity", () => {
  it("uses a database trigger to atomically reject a direct cross-deck duplicate", async () => {
    const source = await deck("Global source");
    const target = await deck("Global target");
    const normalized = normalizeVocabularyTerm("  Accomplish  ");

    await db.flashcard.create({
      data: { deckId: source.id, term: "Accomplish", normalizedTerm: normalized, meaningVi: "hoàn thành" },
    });

    await expect(db.flashcard.create({
      data: { deckId: target.id, term: " accomplish ", normalizedTerm: normalized, meaningVi: "làm được" },
    })).rejects.toMatchObject({ code: "P2003" });

    expect(await db.flashcard.count({ where: { normalizedTerm: normalized } })).toBe(1);
    await expect(db.vocabularyIdentity.findUnique({ where: { normalizedTerm: normalized } }))
      .resolves.toMatchObject({ canonicalFlashcardId: expect.any(String), hasHistoricalDuplicates: false });
  });

  it("applies global uniqueness across collections while preserving distinct phrases and word forms", async () => {
    const folderA = await db.folder.create({ data: { name: "Global collection A", normalizedName: "global-collection-a" } });
    const folderB = await db.folder.create({ data: { name: "Global collection B", normalizedName: "global-collection-b" } });
    const source = await deck("Oxford source", folderA.id);
    const target = await deck("Academic target", folderB.id);

    try {
      await deckService.createManualCards(source.id, [{ term: "follow up", meaningVi: "theo dõi" }]);
      const result = await deckService.createManualCards(target.id, [
        { term: "follow up", meaningVi: "theo dõi lại" },
        { term: "follow-up", meaningVi: "việc theo dõi" },
        { term: "application", meaningVi: "đơn đăng ký" },
        { term: "apply", meaningVi: "áp dụng" },
      ]);

      expect(result).toMatchObject({ cardsCreated: 3, skippedDuplicates: [{ term: "follow up", existingDeckId: source.id }] });
      expect(await db.flashcard.findMany({ where: { deckId: target.id }, orderBy: { term: "asc" } }))
        .toMatchObject([{ term: "application" }, { term: "apply" }, { term: "follow-up" }]);
    } finally {
      await db.folder.delete({ where: { id: folderA.id } });
      await db.folder.delete({ where: { id: folderB.id } });
    }
  });

  it("makes concurrent manual writes idempotent without producing two FSRS records", async () => {
    const left = await deck("Concurrent left");
    const right = await deck("Concurrent right");
    const term = `concurrent-${crypto.randomUUID()}`;

    const outcomes = await Promise.allSettled([
      deckService.createManualCards(left.id, [{ term, meaningVi: "đồng thời" }]),
      deckService.createManualCards(right.id, [{ term: term.toUpperCase(), meaningVi: "đồng thời" }]),
    ]);

    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    const results = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof deckService.createManualCards>>> => outcome.status === "fulfilled").map((outcome) => outcome.value);
    expect(results.reduce((total, result) => total + result.cardsCreated, 0)).toBe(1);
    expect(await db.flashcard.count({ where: { normalizedTerm: normalizeVocabularyTerm(term) } })).toBe(1);
  });
});
