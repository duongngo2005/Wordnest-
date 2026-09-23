import { afterEach, describe, expect, it } from "vitest";
import { FlashcardStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { folderService } from "./folder-service";

const TEST_PREFIX = "Folder feature test";

async function createDeck(name: string) {
  return db.deck.create({
    data: { name: `${TEST_PREFIX} ${name}` },
  });
}

async function createCard(
  deckId: string,
  term: string,
  options: Partial<{
    status: FlashcardStatus;
    state: number;
    due: Date;
  }> = {}
) {
  return db.flashcard.create({
    data: {
      deckId,
      term,
      normalizedTerm: term.toLowerCase(),
      meaningVi: `nghĩa ${term}`,
      definitionEn: `definition ${term}`,
      exampleEn: `Example for ${term}.`,
      exampleVi: `Ví dụ cho ${term}.`,
      status: options.status ?? FlashcardStatus.NEW,
      state: options.state ?? 0,
      due: options.due ?? new Date(),
    },
  });
}

afterEach(async () => {
  await db.deck.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await db.folder.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
});

describe("FolderService", () => {
  it("creates and updates a learning collection", async () => {
    const folder = await folderService.createFolder({
      name: `${TEST_PREFIX} TOEIC`,
      description: "30 ngày chinh phục từ vựng",
      icon: "book",
      color: "orange",
    });

    const updated = await folderService.updateFolder(folder.id, {
      name: `${TEST_PREFIX} TOEIC nâng cao`,
      description: "Lộ trình đã chỉnh sửa",
      icon: "target",
      color: "blue",
    });

    expect(updated).toMatchObject({
      name: `${TEST_PREFIX} TOEIC nâng cao`,
      description: "Lộ trình đã chỉnh sửa",
      icon: "target",
      color: "blue",
    });
  });

  it("moves a deck without losing its flashcards or FSRS state", async () => {
    const folder = await folderService.createFolder({ name: `${TEST_PREFIX} Move` });
    const deck = await createDeck("move deck");
    const card = await createCard(deck.id, "preserve", {
      status: FlashcardStatus.LEARNING,
      state: 1,
    });

    await folderService.moveDeck(deck.id, folder.id);
    const moved = await db.deck.findUniqueOrThrow({
      where: { id: deck.id },
      include: { cards: true },
    });

    expect(moved.folderId).toBe(folder.id);
    expect(moved.cards).toHaveLength(1);
    expect(moved.cards[0]).toMatchObject({ id: card.id, state: 1 });

    await folderService.removeDeck(folder.id, deck.id);
    const removed = await db.deck.findUniqueOrThrow({
      where: { id: deck.id },
      include: { cards: true },
    });
    expect(removed.folderId).toBeNull();
    expect(removed.cards[0]).toMatchObject({ id: card.id, state: 1 });
  });

  it("reorders only the decks that belong to the folder", async () => {
    const folder = await folderService.createFolder({ name: `${TEST_PREFIX} Order` });
    const first = await folderService.createDeckInFolder(folder.id, `${TEST_PREFIX} Day 01`);
    const second = await folderService.createDeckInFolder(folder.id, `${TEST_PREFIX} Day 02`);
    const third = await folderService.createDeckInFolder(folder.id, `${TEST_PREFIX} Day 03`);

    await folderService.reorderDecks(folder.id, [third.id, first.id, second.id]);
    const detail = await folderService.getFolder(folder.id);

    expect(detail?.decks.map((deck) => deck.id)).toEqual([third.id, first.id, second.id]);
  });

  it("derives progress, the next deck, and due reviews from existing cards", async () => {
    const folder = await folderService.createFolder({ name: `${TEST_PREFIX} Progress` });
    const completed = await folderService.createDeckInFolder(folder.id, `${TEST_PREFIX} Day complete`);
    const active = await folderService.createDeckInFolder(folder.id, `${TEST_PREFIX} Day active`);
    const dueYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await createCard(completed.id, "known", { status: FlashcardStatus.KNOWN, state: 2, due: tomorrow });
    await createCard(active.id, "due", { status: FlashcardStatus.LEARNING, state: 1, due: dueYesterday });
    await createCard(active.id, "new", { status: FlashcardStatus.NEW, state: 0 });

    const progress = await folderService.getFolderProgress(folder.id);
    const nextDeck = await folderService.getNextDeck(folder.id);
    const reviewCards = await folderService.getFolderReviewCards(folder.id);

    expect(progress).toMatchObject({
      totalCards: 3,
      knownCount: 1,
      completedDecks: 1,
      dueTodayCount: 1,
    });
    expect(nextDeck?.id).toBe(active.id);
    expect(reviewCards.map((card) => card.term)).toEqual(["due"]);
  });

  it("deletes a folder safely by leaving its decks and cards uncategorized", async () => {
    const folder = await folderService.createFolder({ name: `${TEST_PREFIX} Safe delete` });
    const deck = await folderService.createDeckInFolder(folder.id, `${TEST_PREFIX} Keep deck`);
    const card = await createCard(deck.id, "keep");

    await folderService.deleteFolder(folder.id);
    const retainedDeck = await db.deck.findUniqueOrThrow({
      where: { id: deck.id },
      include: { cards: true },
    });

    expect(retainedDeck.folderId).toBeNull();
    expect(retainedDeck.cards.map((item) => item.id)).toEqual([card.id]);
  });
});
