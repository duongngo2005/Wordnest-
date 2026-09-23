import { expect, test } from "@playwright/test";
import { FlashcardStatus } from "@prisma/client";
import { db } from "@/lib/db";

let folderIds: string[] = [];
let deckIds: string[] = [];

function uniqueName(testId: string, suffix: string) {
  return `E2E Collection ${Date.now()} ${testId.slice(-6)} ${suffix}`;
}

async function createFolder(name: string) {
  const folder = await db.folder.create({
    data: {
      name,
      normalizedName: name.toLocaleLowerCase(),
    },
  });
  folderIds.push(folder.id);
  return folder;
}

async function createDeck(folderId: string, name: string, position: number) {
  const deck = await db.deck.create({ data: { folderId, name, position } });
  deckIds.push(deck.id);
  return deck;
}

async function createCard(
  deckId: string,
  term: string,
  options: {
    status?: FlashcardStatus;
    state?: number;
    due?: Date;
  } = {}
) {
  return db.flashcard.create({
    data: {
      deckId,
      term,
      normalizedTerm: term.toLocaleLowerCase(),
      meaningVi: `Nghĩa của ${term}`,
      definitionEn: `Definition of ${term}`,
      exampleEn: `${term} is used in this example.`,
      exampleVi: `Đây là ví dụ của ${term}.`,
      status: options.status ?? FlashcardStatus.NEW,
      state: options.state ?? 0,
      due: options.due ?? new Date(),
    },
  });
}

test.beforeEach(() => {
  folderIds = [];
  deckIds = [];
});

test.afterEach(async () => {
  // Deleting a test deck cascades only its own flashcards/review logs. Do not
  // touch user-created decks, including the deck intentionally unassigned by
  // the safe folder-delete scenario below.
  if (deckIds.length > 0) {
    await db.deck.deleteMany({ where: { id: { in: deckIds } } });
  }
  if (folderIds.length > 0) {
    await db.folder.deleteMany({ where: { id: { in: folderIds } } });
  }
});

test.describe("learning collections", () => {
  test("creates a collection, creates a deck in it, supports expand/collapse, and persists data after refresh", async ({ page }, testInfo) => {
    const folderName = uniqueName(testInfo.testId, "create");
    const deckName = `${folderName} Day 01`;

    await page.goto("/");
    await page.getByRole("button", { name: "Bộ sưu tập", exact: true }).click();
    await page.getByLabel("Tên bộ sưu tập").fill(folderName);
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("link", { name: new RegExp(folderName) })).toBeVisible();

    await expect.poll(async () => {
      return db.folder.findUnique({ where: { normalizedName: folderName.toLocaleLowerCase() } });
    }).toMatchObject({ name: folderName });
    const createdFolder = await db.folder.findUniqueOrThrow({ where: { normalizedName: folderName.toLocaleLowerCase() } });
    folderIds.push(createdFolder.id);

    await page.getByLabel(`Mở ${folderName}`).click();
    await page.getByRole("button", { name: `Tạo bộ từ trong ${folderName}` }).click();
    await page.getByLabel("Tên bộ từ").fill(deckName);
    await page.getByRole("button", { name: "Tạo", exact: true }).click();
    await expect(page).toHaveURL(/\/decks\/[a-z0-9]+$/);

    await expect.poll(async () => {
      return db.deck.findFirst({ where: { folderId: createdFolder.id, name: deckName } });
    }).toMatchObject({ folderId: createdFolder.id, name: deckName });
    const deck = await db.deck.findFirstOrThrow({ where: { folderId: createdFolder.id, name: deckName } });
    deckIds.push(deck.id);

    await page.goto("/");
    await expect(page.getByRole("link", { name: deckName })).toBeHidden();
    await page.getByLabel(`Mở ${folderName}`).click();
    await expect(page.getByRole("link", { name: deckName })).toBeVisible();
    await page.getByLabel(`Thu gọn ${folderName}`).click();
    await expect(page.getByRole("link", { name: deckName })).toBeHidden();
    await page.getByLabel(`Mở ${folderName}`).click();
    await page.reload();
    await expect(page.getByRole("link", { name: deckName })).toBeHidden();
    await page.getByLabel(`Mở ${folderName}`).click();
    await expect(page.getByRole("link", { name: deckName })).toBeVisible();
  });

  test("aggregates progress, continues at the first incomplete deck, and reviews due cards", async ({ page }, testInfo) => {
    const folder = await createFolder(uniqueName(testInfo.testId, "progress"));
    const completeDeck = await createDeck(folder.id, `${folder.name} Day 01`, 0);
    const activeDeck = await createDeck(folder.id, `${folder.name} Day 02`, 1);
    await createCard(completeDeck.id, `${folder.id}-complete`, {
      status: FlashcardStatus.KNOWN,
      state: 2,
      due: new Date(Date.now() + 86_400_000),
    });
    const dueTerm = `${folder.id}-due`;
    await createCard(activeDeck.id, dueTerm, {
      status: FlashcardStatus.KNOWN,
      state: 2,
      due: new Date(Date.now() - 60_000),
    });
    await createCard(activeDeck.id, `${folder.id}-new`);

    await page.goto(`/folders/${folder.id}`);
    await expect(page.getByRole("heading", { name: folder.name })).toBeVisible();
    // Both the due and future Review cards are in the scheduler-derived
    // KNOWN/Review projection; only the third card is New.
    await expect(page.getByText(activeDeck.name, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Ôn tập" }).click();
    await expect(page).toHaveURL(new RegExp(`/decks/${activeDeck.id}/study$`));

    await expect(page.getByRole("heading", { name: dueTerm })).toBeVisible();
  });

  test("moves, reorders, and safely deletes collections", async ({ page }, testInfo) => {
    const source = await createFolder(uniqueName(testInfo.testId, "source"));
    const destination = await createFolder(uniqueName(testInfo.testId, "destination"));
    const safeDeck = await createDeck(source.id, `${source.name} keep`, 0);
    const movableDeck = await createDeck(source.id, `${source.name} move`, 1);
    const firstDestinationDeck = await createDeck(destination.id, `${destination.name} first`, 0);
    const secondDestinationDeck = await createDeck(destination.id, `${destination.name} second`, 1);
    await createCard(safeDeck.id, `${source.id}-card`);

    await page.goto("/");
    await page.getByLabel(`Mở ${source.name}`).click();
    await page.getByLabel(`Tùy chọn cho ${movableDeck.name}`, { exact: true }).click();
    await page
      .getByLabel(`Chuyển ${movableDeck.name} tới bộ sưu tập`)
      .selectOption(destination.id);
    await expect.poll(async () => (await db.deck.findUniqueOrThrow({ where: { id: movableDeck.id } })).folderId).toBe(destination.id);

    await page.getByLabel(`Mở ${destination.name}`).click();
    await page.getByLabel(`Tùy chọn cho ${secondDestinationDeck.name}`, { exact: true }).click();
    await page.getByRole("button", { name: "Lên", exact: true }).click();
    await expect.poll(async () => {
      const decks = await db.deck.findMany({ where: { folderId: destination.id }, orderBy: { position: "asc" }, select: { id: true } });
      return decks.map((deck) => deck.id);
    }).toEqual([secondDestinationDeck.id, firstDestinationDeck.id, movableDeck.id]);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel(`Tùy chọn cho ${source.name}`, { exact: true }).click();
    await page.getByRole("button", { name: "Xóa", exact: true }).click();
    await expect.poll(async () => db.folder.findUnique({ where: { id: source.id } })).toBeNull();
    const retainedDeck = await db.deck.findUniqueOrThrow({ where: { id: safeDeck.id }, include: { cards: true } });
    expect(retainedDeck.folderId).toBeNull();
    expect(retainedDeck.cards).toHaveLength(1);

  });
});
