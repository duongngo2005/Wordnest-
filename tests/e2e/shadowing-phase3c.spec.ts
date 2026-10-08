import { expect, test, type Page } from "@playwright/test";
import { db } from "@/lib/db";

let deckId: string | null = null;

async function seedContextualSources(testId: string) {
  const deck = await db.deck.create({ data: { name: `Shadowing 3C ${testId.slice(-8)}` } });
  deckId = deck.id;
  const targetWords = {
    schemaVersion: 3,
    requestedTerms: [],
    usage: [],
    contextualTranslations: [],
    selectionTranslations: [],
  };

  const [story, lesson] = await Promise.all([
    db.story.create({
      data: {
        deckId: deck.id,
        title: "A Clear Story",
        content: "First sentence. Second sentence.",
        cefr: "B1",
        length: "short",
        topic: "Daily Life",
        targetWords,
      },
    }),
    db.lesson.create({
      data: {
        deckId: deck.id,
        title: "A Clear Lesson",
        content: "First sentence. Second sentence.",
        cefr: "B1",
        targetWords,
      },
    }),
  ]);

  return { deck, story, lesson };
}

async function enterShadowing(page: Page) {
  const trigger = page.getByRole("button", { name: "Nghe & nói nhại (Shadowing)" }).first();
  await trigger.click();
  await expect(page.getByRole("heading", { name: "Nghe & nói nhại", level: 1 })).toBeFocused();
  return trigger;
}

test.afterEach(async () => {
  if (deckId) await db.deck.delete({ where: { id: deckId } }).catch(() => {});
  deckId = null;
});

test("Story Shadowing is optional, focus-managed, and returns to the Story entry", async ({ page }, testInfo) => {
  const { deck } = await seedContextualSources(testInfo.testId);

  await page.goto(`/decks/${deck.id}/story`);
  const trigger = await enterShadowing(page);

  await expect(page.getByText("Tùy chọn: nghe câu mẫu, nói nhại, rồi xem văn bản mà trình duyệt nhận diện.")).toBeVisible();
  await expect(page.getByText("Khớp văn bản nhận diện với câu mẫu; không đánh giá phát âm, giọng hay mức độ thành thạo.")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Tiến độ câu" })).toHaveAttribute("value", "1");
  await expect(page.getByRole("group", { name: "Tốc độ câu mẫu" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "1x" })).toBeChecked();

  await page.getByRole("button", { name: "Quay lại truyện" }).click();
  await expect(trigger).toBeFocused();
});

test("Lesson Shadowing returns to the Lesson entry", async ({ page }, testInfo) => {
  const { deck } = await seedContextualSources(testInfo.testId);

  await page.goto(`/decks/${deck.id}/lesson`);
  const trigger = await enterShadowing(page);
  await page.getByRole("button", { name: "Quay lại bài học" }).click();
  await expect(trigger).toBeFocused();
});

test("permission denial stays recoverable and never presents an active recording control", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      },
    });
  });
  const { deck } = await seedContextualSources(testInfo.testId);

  await page.goto(`/decks/${deck.id}/story`);
  await enterShadowing(page);
  await page.getByRole("button", { name: "Nói lại câu này" }).click();

  await expect(page.getByText("WordNest chưa được phép dùng microphone. Hãy bật quyền microphone trong trình duyệt để luyện nói.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dừng nói" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thử lại ghi âm" })).toBeVisible();
  await expect(page.getByText("First sentence.")).toBeVisible();
});

test("does not promise recording when both MediaRecorder and SpeechRecognition are unavailable", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: undefined });
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
  });
  const { deck } = await seedContextualSources(testInfo.testId);

  await page.goto(`/decks/${deck.id}/story`);
  await enterShadowing(page);

  await expect(page.getByText("Trình duyệt này chưa hỗ trợ nhận diện giọng nói.")).toBeVisible();
  await expect(page.getByText("Thiết bị này không hỗ trợ ghi âm. Bạn vẫn có thể nghe câu mẫu.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ghi âm không được hỗ trợ" })).toBeDisabled();
});

test("a reference-audio error is recoverable through the shared speech boundary", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.speechSynthesis, "speak", {
      configurable: true,
      value: (utterance: SpeechSynthesisUtterance) => {
        utterance.onerror?.(new Event("error") as SpeechSynthesisErrorEvent);
      },
    });
  });
  const { deck } = await seedContextualSources(testInfo.testId);

  await page.goto(`/decks/${deck.id}/story`);
  await enterShadowing(page);
  await page.getByRole("button", { name: "Nghe câu mẫu" }).click();

  await expect(page.getByText("Không thể phát câu mẫu. Bạn có thể thử lại.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nghe câu mẫu" })).toBeEnabled();
});

test("an empty recognition result has no score and keeps the local retry path", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    class EmptyRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      maxAlternatives = 1;
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event & { error: string }) => void) | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() { this.onstart?.(); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    class LocalRecorder {
      static isTypeSupported() { return true; }
      state: RecordingState = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {}
      start() {
        this.state = "recording";
        this.ondataavailable?.({ data: new Blob(["local audio"], { type: this.mimeType }) } as BlobEvent);
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: EmptyRecognition });
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: LocalRecorder });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => ({ getTracks: () => [] }),
    });
  });
  const { deck } = await seedContextualSources(testInfo.testId);

  await page.goto(`/decks/${deck.id}/story`);
  await enterShadowing(page);
  await page.getByRole("button", { name: "Nói lại câu này" }).click();
  await expect(page.getByRole("button", { name: "Dừng nói" })).toBeVisible();
  await page.getByRole("button", { name: "Dừng nói" }).click();

  await expect(page.getByText("Chưa nhận được văn bản. Bạn có thể nghe lại bản ghi hoặc nói lại câu này.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nghe lại giọng mình" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();
});

test("a recognition network error keeps the local recording recoverable", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    class NetworkRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      maxAlternatives = 1;
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event & { error: string }) => void) | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onstart?.();
        queueMicrotask(() => this.onerror?.(Object.assign(new Event("error"), { error: "network" })));
      }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    class LocalRecorder {
      static isTypeSupported() { return true; }
      state: RecordingState = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {}
      start() {
        this.state = "recording";
        this.ondataavailable?.({ data: new Blob(["local audio"], { type: this.mimeType }) } as BlobEvent);
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: NetworkRecognition });
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: LocalRecorder });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => ({ getTracks: () => [] }),
    });
  });
  const { deck } = await seedContextualSources(testInfo.testId);

  await page.goto(`/decks/${deck.id}/story`);
  await enterShadowing(page);
  await page.getByRole("button", { name: "Nói lại câu này" }).click();
  await expect(page.getByText("Không thể kết nối đến dịch vụ nhận diện giọng nói.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dừng nói" })).toBeVisible();
  await page.getByRole("button", { name: "Dừng nói" }).click();

  await expect(page.getByRole("button", { name: "Nghe lại giọng mình" })).toBeVisible();
  await expect(page.getByText("Không thể nhận diện giọng nói cho lượt này. Bản ghi cục bộ vẫn được giữ để bạn nghe lại hoặc thử lại.")).toBeVisible();
});

test("mobile player keeps controls touch-safe and has no horizontal overflow", async ({ page }, testInfo) => {
  const { deck } = await seedContextualSources(testInfo.testId);
  await page.setViewportSize({ width: 375, height: 844 });

  await page.goto(`/decks/${deck.id}/story`);
  await enterShadowing(page);

  for (const radioName of ["0.8x", "1x", "1.2x"]) {
    const box = await page.getByRole("radio", { name: radioName }).locator("..").boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
