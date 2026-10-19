import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { JsonFlashcardImport, canSaveJsonImportPreview } from "./JsonFlashcardImport";

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

describe("External AI V3 import action gate", () => {
  const validPreview = {
    previewValid: true,
    hasLocalEdits: false,
    hasPendingImages: false,
    hasFailedImages: false,
    isImporting: false,
    newCardCount: 1,
  };

  it("uses one final commit action for an otherwise valid V3 preview", () => {
    expect(canSaveJsonImportPreview(validPreview)).toBe(true);
  });

  it("never enables saving while edits have not been revalidated", () => {
    expect(canSaveJsonImportPreview({ ...validPreview, hasLocalEdits: true })).toBe(false);
  });

  it("does not offer a save when every valid response is already known globally", () => {
    expect(canSaveJsonImportPreview({ ...validPreview, newCardCount: 0 })).toBe(false);
  });

  it("allows the final action for a keep-only or overwrite-only V3 batch", () => {
    expect(canSaveJsonImportPreview({
      ...validPreview,
      newCardCount: 0,
      reviewedExistingCount: 3,
    })).toBe(true);
    expect(canSaveJsonImportPreview({
      ...validPreview,
      newCardCount: 0,
      overwriteCount: 1,
    })).toBe(true);
  });

  it("uses visible labels and empty large textareas for the compact AI flow", () => {
    const html = renderToStaticMarkup(
      <JsonFlashcardImport deckId="deck-1" deckName="Deck" onSaved={() => undefined} />
    );

    expect(html).toContain("Danh sách từ");
    expect(html).toContain("JSON flashcard");
    expect(html).toContain("Thêm ngữ cảnh");
    expect(html).toContain("Tạo và sao chép prompt");
    expect(html).not.toContain("placeholder=");
    expect(html).not.toContain("Dán toàn bộ kết quả JSON");
  });
});
