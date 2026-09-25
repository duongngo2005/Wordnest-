import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

let deckId: string | null = null;

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
});

test("keeps the story translation pronunciation control and IPA in fixed regions while audio plays", async ({ page }, testInfo) => {
  const deck = await db.deck.create({
    data: {
      name: `Story pronunciation ${testInfo.testId.slice(-8)}`,
      cards: {
        create: {
          term: "association",
          normalizedTerm: "association",
          meaningVi: "hiệp hội, tổ chức",
          ipa: "/əˌsəʊ.siˈeɪ.ʃən/",
          partOfSpeech: "noun",
        },
      },
    },
  });
  deckId = deck.id;

  await db.story.create({
    data: {
      deckId: deck.id,
      title: "A Community Association",
      content: "The association meets at the community center today.",
      cefr: "B1",
      length: "short",
      topic: "Daily Life",
      targetWords: {
        schemaVersion: 3,
        requestedTerms: ["association"],
        usage: [{ term: "association", usedAs: "association" }],
        contextualTranslations: [
          { term: "association", usedAs: "association", meaningVi: "hiệp hội, tổ chức" },
        ],
        selectionTranslations: [],
      },
    },
  });

  await page.goto(`/decks/${deck.id}/story`);
  await page.getByRole("button", { name: "Xem nghĩa của association" }).click();

  const panel = page.getByLabel("Nghĩa từ trong truyện");
  const pronunciation = panel.getByRole("button", { name: "Phát âm", exact: true });
  const ipa = panel.getByText("/əˌsəʊ.siˈeɪ.ʃən/", { exact: true });

  await expect(pronunciation).toBeVisible();
  const before = await ipa.boundingBox();

  await pronunciation.click();
  await expect(pronunciation).toHaveAttribute("data-speaking", "true");
  await expect(pronunciation).toHaveText("Phát âm");

  const after = await ipa.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after?.x).toBeCloseTo(before?.x ?? 0, 0);
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);
});
