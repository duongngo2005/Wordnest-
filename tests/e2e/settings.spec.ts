import { expect, test } from "@playwright/test";

test.describe("voice settings", () => {
  test.use({ viewport: { width: 430, height: 932 } });

  test("loads System and WordNest voices, previews, and persists either choice on iPhone 15 Pro Max", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.speechSynthesis, "getVoices", {
        configurable: true,
        value: () => [
          { voiceURI: "Samantha", name: "Samantha", lang: "en-US", localService: true, default: true },
          { voiceURI: "Daniel", name: "Daniel", lang: "en-GB", localService: true, default: false },
        ],
      });
    });
    await page.route("**/api/tts/voices", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ enabled: true, voices: [] }),
      })
    );
    await page.route("**/api/tts?**", (route) =>
      route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([73, 68, 51, 4]) })
    );

    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "Cài đặt" })).toBeVisible();
    await expect(page.getByRole("group", { name: "WordNest" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Ava/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Ryan/ })).toBeVisible();
    await expect(page.getByRole("group", { name: "Hệ thống" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Samantha/ })).toBeVisible();

    const avaRadio = page.getByRole("radio", { name: /Ava/ });
    await avaRadio.check();
    await expect(avaRadio).toBeChecked();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("wordnest.speech-preferences.v1")))
      .toBe(JSON.stringify({ voiceURI: "wordnest:ava", rate: 0.9 }));

    const previewRequest = page.waitForRequest((request) =>
      request.url().includes("/api/tts?text=Small") && request.url().includes("voice=wordnest%3Aava")
    );
    await page.getByRole("button", { name: "Nghe thử Ava" }).click();
    await expect(previewRequest).resolves.toBeTruthy();

    const samanthaRadio = page.getByRole("radio", { name: /Samantha/ });
    await samanthaRadio.check();
    await expect(samanthaRadio).toBeChecked();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("wordnest.speech-preferences.v1")))
      .toBe(JSON.stringify({ voiceURI: "Samantha", rate: 0.9 }));

    const fasterRate = page.getByRole("radio", { name: "1.15×" });
    await fasterRate.check();
    await expect(fasterRate).toBeChecked();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("wordnest.speech-preferences.v1")))
      .toBe(JSON.stringify({ voiceURI: "Samantha", rate: 1.15 }));

    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("mascot settings", () => {
  test("switches to Dino, persists the choice, and applies its green theme", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/settings");

    const mascotGroup = page.getByRole("group", { name: "Chọn linh vật WordNest" });
    const dinoRadio = mascotGroup.getByRole("radio", { name: /Dino/ });
    await expect(dinoRadio).toBeVisible();
    await dinoRadio.check();
    await expect(dinoRadio).toBeChecked();

    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("wordnest.mascot.v1")))
      .toBe("dino");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.mascotTheme))
      .toBe("dino");
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()))
      .toBe("#27843d");

    await expect(page.getByRole("button", { name: /Boop the Dino/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "scratch/mascot-settings-desktop.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "scratch/mascot-settings-mobile.png", fullPage: true });
  });
});
