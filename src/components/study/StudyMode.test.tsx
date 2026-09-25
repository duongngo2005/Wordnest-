import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyMode } from "./StudyMode";
import { FlashcardData } from "../flashcards/FlashcardItem";
import { FlashcardStatus } from "@/lib/flashcards/status";
import { ToastProvider } from "../ui/ToastProvider";

const mockCards: FlashcardData[] = [
  {
    id: "card-1",
    deckId: "deck-1",
    term: "resilient",
    normalizedTerm: "resilient",
    meaningVi: "kiên cường, phục hồi nhanh",
    definitionEn: "able to recover quickly",
    ipa: "/rɪˈzɪl.jənt/",
    partOfSpeech: "adj",
    cefr: "B2",
    exampleEn: "She is remarkably resilient.",
    exampleVi: "Cô ấy kiên cường một cách đáng nể.",
    imageUrl: null,
    imageSource: null,
    imageSearchQuery: null,
    status: FlashcardStatus.LEARNING,
    due: new Date(),
    stability: 2.0,
    difficulty: 4.5,
    elapsedDays: 1,
    scheduledDays: 2,
    reps: 1,
    lapses: 0,
    state: 1,
  },
];

function renderWithToast(ui: React.ReactElement) {
  return renderToStaticMarkup(<ToastProvider>{ui}</ToastProvider>);
}

describe("StudyMode component", () => {
  it("renders empty state when deck has no cards", () => {
    const html = renderWithToast(
      <StudyMode
        deckId="deck-empty"
        deckName="Trống"
        initialCards={[]}
        mode="scheduled-review"
      />
    );
    expect(html).toContain("Không có thẻ nào để học!");
  });

  it("renders front question initially with term and progress bar", () => {
    const html = renderWithToast(
      <StudyMode
        deckId="deck-1"
        deckName="Từ vựng cốt lõi"
        initialCards={mockCards}
        mode="scheduled-review"
      />
    );
    expect(html).toContain("resilient");
    expect(html).toContain("CÂU HỎI");
    expect(html).toContain("Hiện đáp án");
    expect(html).toContain("1 / 1");
  });
});
