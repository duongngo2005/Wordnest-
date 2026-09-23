import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";

declare global {
  interface Window {
    __wordNestAudioEvents?: string[];
  }
}

let deckId: string | null = null;

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } });
  deckId = null;
});

test("uses the selected WordNest voice for playable pronunciation", async ({ page }) => {
  const deck = await db.deck.create({
    data: {
      name: `Audio ${crypto.randomUUID()}`,
      cards: { create: { term: "allocate", normalizedTerm: "allocate", meaningVi: "phân bổ" } },
    },
  });
  deckId = deck.id;

  await page.addInitScript(() => {
    const audioEvents: string[] = [];
    Object.defineProperty(window, "__wordNestAudioEvents", { configurable: true, value: audioEvents });
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.addEventListener("playing", () => audioEvents.push("playing"), { once: true });
      this.addEventListener("error", () => audioEvents.push("error"), { once: true });
      const result = nativePlay.call(this);
      result?.catch(() => audioEvents.push("play-rejected"));
      return result;
    };
  });

  await page.goto(`/decks/${deckId}`);
  await page.evaluate(() => {
    localStorage.setItem("wordnest.speech-preferences.v1", JSON.stringify({ voiceURI: "wordnest:en-GB", rate: 0.9 }));
  });
  await page.reload();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("wordnest.speech-preferences.v1")))
    .toBe(JSON.stringify({ voiceURI: "wordnest:en-GB", rate: 0.9 }));

  await page.route("**/api/tts?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });

  let requestDelay = -1;
  const clickStartedAt = Date.now();
  page.on("request", (request) => {
    if (request.url().includes("/api/tts?text=allocate&voice=en-GB")) requestDelay = Date.now() - clickStartedAt;
  });
  const audioRequest = page.waitForRequest(/\/api\/tts\?text=allocate&voice=en-GB/, { timeout: 750 });
  const pronounceButton = page.getByRole("button", { name: "Nghe" });
  await pronounceButton.click();
  await expect(pronounceButton).toHaveText("Đang đọc...");
  await expect(audioRequest).resolves.toBeTruthy();
  expect(requestDelay).toBeLessThan(750);
  await expect.poll(() => page.evaluate(() => window.__wordNestAudioEvents ?? [])).toContain("playing");
});
