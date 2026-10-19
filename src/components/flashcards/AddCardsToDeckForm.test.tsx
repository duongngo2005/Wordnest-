import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddCardsToDeckForm } from "./AddCardsToDeckForm";

vi.mock("./ManualCardsEditor", () => ({
  ManualCardsEditor: () => <div>Manual editor</div>,
}));

vi.mock("./JsonFlashcardImport", () => ({
  JsonFlashcardImport: () => <div>External JSON import</div>,
}));

describe("AddCardsToDeckForm", () => {
  it("keeps manual and External AI JSON entry points while removing Local AI flashcard generation", () => {
    const html = renderToStaticMarkup(
      <AddCardsToDeckForm
        deckId="deck-1"
        deckName="Deck"
        onClose={() => undefined}
        onCardsCreated={() => undefined}
      />
    );

    expect(html).toContain("Thủ công");
    expect(html).toContain("AI JSON");
    expect(html).toContain("Manual editor");
    expect(html).toContain("External JSON import");
    expect(html).not.toContain("Gợi ý tự động");
    expect(html).not.toContain("Tạo bản nháp AI");
  });
});
