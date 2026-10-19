import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  StudyManualDuplicateReviewDialog,
  StudyManualFlashcardDialog,
  type StudyManualDuplicatePreview,
} from "./StudyManualFlashcardDialog";

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

describe("Study manual flashcard dialogs", () => {
  it("renders a focused manual entry dialog with visible labels and a duplicate check action", () => {
    const html = renderToStaticMarkup(
      <StudyManualFlashcardDialog
        deckId="deck-1"
        onClose={() => undefined}
        onDuplicateFound={() => undefined}
        onCreated={() => undefined}
      />
    );

    expect(html).toContain("Thêm từ trong lúc ôn");
    expect(html).toContain("Từ");
    expect(html).toContain("Nghĩa tiếng Việt");
    expect(html).toContain("Thông tin thêm");
    expect(html).toContain("Kiểm tra và thêm");
    expect(html).toContain("<dialog");
  });

  it("shows the existing card and requires an explicit overwrite choice", () => {
    const preview: StudyManualDuplicatePreview = {
      classification: "existing",
      incomingFingerprint: "a".repeat(64),
      changedFields: ["meaningVi", "exampleEn"],
      existingCard: {
        id: "existing-card",
        term: "resilient",
        meaningVi: "kiên cường",
        partOfSpeech: "adjective",
        ipa: "/rɪˈzɪl.jənt/",
        definitionEn: "able to recover quickly",
        exampleEn: "She is resilient.",
        exampleVi: "Cô ấy rất kiên cường.",
        cefr: "B2",
        imageUrl: null,
        contentVersion: "2026-10-18T00:00:00.000Z",
        locations: [{ cardId: "existing-card", deckId: "deck-old", deckName: "Từ nền tảng" }],
      },
    };
    const html = renderToStaticMarkup(
      <StudyManualDuplicateReviewDialog
        deckId="deck-1"
        draft={{ term: "resilient", meaningVi: "bền bỉ", exampleEn: "The team stayed resilient." }}
        preview={preview}
        onBack={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(html).toContain("Thẻ đã tồn tại");
    expect(html).toContain("Từ nền tảng");
    expect(html).toContain("Thẻ hiện có");
    expect(html).toContain("Giữ thẻ hiện có");
    expect(html).toContain("Ghi đè thẻ hiện có");
  });
});
