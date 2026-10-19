import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlashcardEditorDialog } from "./FlashcardEditorDialog";
import { FlashcardData } from "./FlashcardItem";
import { FlashcardStatus } from "@/lib/flashcards/status";
import { ToastProvider } from "@/components/ui/ToastProvider";

const card: FlashcardData = {
  id: "card-1",
  deckId: "deck-1",
  term: "allocate",
  normalizedTerm: "allocate",
  meaningVi: "phân bổ",
  definitionEn: "to distribute resources for a purpose",
  ipa: "/ˈæl.ə.keɪt/",
  partOfSpeech: "verb",
  cefr: "B2",
  exampleEn: "The company allocated more money.",
  exampleVi: "Công ty đã phân bổ thêm tiền.",
  imageUrl: null,
  imageSource: null,
  imageSearchQuery: null,
  status: FlashcardStatus.LEARNING,
};

describe("FlashcardEditorDialog", () => {
  it("renders every editable lexical field without exposing scheduler fields", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <FlashcardEditorDialog card={card} onClose={vi.fn()} onSave={vi.fn()} />
      </ToastProvider>
    );

    expect(html).toContain("Chỉnh sửa thẻ");
    expect(html).toContain("Từ");
    expect(html).toContain("Nghĩa tiếng Việt");
    expect(html).toContain("Từ loại");
    expect(html).toContain("CEFR");
    expect(html).toContain("IPA");
    expect(html).toContain("Định nghĩa tiếng Anh");
    expect(html).toContain("Ví dụ tiếng Anh");
    expect(html).toContain("Dịch ví dụ");
    expect(html).toContain("Tìm hoặc tải ảnh");
    expect(html).not.toContain("Ngày ôn");
    expect(html).not.toContain("Stability");
  });
});
