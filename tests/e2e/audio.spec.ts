import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

let deckId: string | null = null;

async function createAudioDeck() {
  const deck = await db.deck.create({
    data: {
      name: `Audio ${crypto.randomUUID()}`,
      cards: { create: { term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ" } },
    },
  });
  deckId = deck.id;
  return deck;
}

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
});

test("Flashcard sends only the selected curated WordNest voice to the audio route", async ({ page }) => {
  const deck = await createAudioDeck();
  await page.route("**/api/tts?**", (route) =>
    route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([73, 68, 51, 4]) })
  );

  await page.goto(`/decks/${deck.id}`);
  await page.evaluate(() => {
    localStorage.setItem("wordnest.speech-preferences.v1", JSON.stringify({ voiceURI: "wordnest:ava", rate: 0.9 }));
  });
  await page.reload();

  const audioRequest = page.waitForRequest((request) =>
    request.url().includes("/api/tts?text=allocate") && request.url().includes("voice=wordnest%3Aava")
  );
  await page.getByRole("button", { name: 'Phát âm "allocate"' }).click();

  await expect(audioRequest).resolves.toBeTruthy();
});

test("Flashcard keeps using system speech when a system voice is selected", async ({ page }) => {
  const deck = await createAudioDeck();
  await page.addInitScript(() => {
    const speechEvents: string[] = [];
    Object.defineProperty(window, "__wordNestSpeechEvents", { configurable: true, value: speechEvents });
    Object.defineProperty(window.speechSynthesis, "speak", {
      configurable: true,
      value: (utterance: SpeechSynthesisUtterance) => {
        speechEvents.push("speak");
        utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
        window.setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), 0);
      },
    });
  });

  await page.goto(`/decks/${deck.id}`);
  await page.evaluate(() => {
    localStorage.setItem("wordnest.speech-preferences.v1", JSON.stringify({ voiceURI: null, rate: 1 }));
  });
  await page.reload();

  let cloudRequestMade = false;
  page.on("request", (request) => {
    if (request.url().includes("/api/tts?")) cloudRequestMade = true;
  });
  await page.getByRole("button", { name: 'Phát âm "allocate"' }).click();

  await expect.poll(() => page.evaluate(() => (window as Window & { __wordNestSpeechEvents?: string[] }).__wordNestSpeechEvents ?? [])).toContain("speak");
  expect(cloudRequestMade).toBe(false);
});

test("a Cloud voice failure falls back to system speech without blocking a Flashcard", async ({ page }) => {
  const deck = await createAudioDeck();
  await page.addInitScript(() => {
    Object.defineProperty(window.speechSynthesis, "speak", {
      configurable: true,
      value: (utterance: SpeechSynthesisUtterance) => utterance.onstart?.(new Event("start") as SpeechSynthesisEvent),
    });
  });
  await page.route("**/api/tts?**", (route) => route.fulfill({ status: 503, body: "unavailable" }));

  await page.goto(`/decks/${deck.id}`);
  await page.evaluate(() => {
    localStorage.setItem("wordnest.speech-preferences.v1", JSON.stringify({ voiceURI: "wordnest:ava", rate: 0.9 }));
  });
  await page.reload();
  await page.getByRole("button", { name: 'Phát âm "allocate"' }).click();

  await expect(page.getByRole("status").filter({ hasText: "Đang dùng giọng hệ thống." })).toBeVisible();
});
