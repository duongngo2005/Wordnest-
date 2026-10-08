import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlashcardPracticeRunner } from "./FlashcardPracticeRunner";
import type { PracticeFlashcardData } from "./flashcard-practice-session";
import { ToastProvider } from "@/components/ui/ToastProvider";

const cards: PracticeFlashcardData[] = [
  { id: "card-1", term: "apple", meaningVi: "quả táo" },
  { id: "card-2", term: "banana", meaningVi: "quả chuối" },
];

function renderRunner(initialCards: PracticeFlashcardData[]) {
  return renderToStaticMarkup(
    <ToastProvider>
      <FlashcardPracticeRunner deckId="deck-1" deckName="Từ vựng cốt lõi" initialCards={initialCards} />
    </ToastProvider>
  );
}

describe("FlashcardPracticeRunner", () => {
  it("only offers VI → EN and Mix before a session begins", () => {
    const html = renderRunner(cards);

    expect(html).toContain("Luyện thẻ");
    expect(html).toContain("VI → EN");
    expect(html).toContain("Mix");
    expect(html).not.toContain("EN → VI");
    expect(html).toContain('checked="" value="vi_en"');
    expect(html).toContain("Bắt đầu luyện");
    expect(html).not.toContain("Again");
    expect(html).not.toContain("Hard");
    expect(html).not.toContain("Good");
    expect(html).not.toContain("Easy");
  });

  it("shows a clear empty state for a deck without cards", () => {
    const html = renderRunner([]);

    expect(html).toContain("Bộ từ này chưa có thẻ để luyện.");
    expect(html).toContain("Quay lại bộ từ");
  });
});
