import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhysicalFlashcard } from "./PhysicalFlashcard";
import { Rating } from "@/lib/fsrs";
import { FlashcardData } from "../flashcards/FlashcardItem";
import { FlashcardStatus } from "@/lib/flashcards/status";
import { ToastProvider } from "../ui/ToastProvider";

const mockCard: FlashcardData = {
  id: "card-1",
  deckId: "deck-1",
  term: "ephemeral",
  normalizedTerm: "ephemeral",
  meaningVi: "phù du, chóng tàn",
  definitionEn: "lasting for a very short time",
  ipa: "/ɪˈfem.ər.əl/",
  partOfSpeech: "adj",
  cefr: "C1",
  exampleEn: "Fame in the internet age is often ephemeral.",
  exampleVi: "Sự nổi tiếng trong thời đại internet thường rất phù du.",
  imageUrl: null,
  imageSource: null,
  imageSearchQuery: null,
  status: FlashcardStatus.LEARNING,
  due: new Date(),
  stability: 2.5,
  difficulty: 4.0,
  elapsedDays: 1,
  scheduledDays: 3,
  reps: 2,
  lapses: 0,
  state: 1,
};

function renderWithToast(ui: React.ReactElement) {
  return renderToStaticMarkup(<ToastProvider>{ui}</ToastProvider>);
}

describe("PhysicalFlashcard component", () => {
  it("renders front side with term, audio button and reveal CTA", () => {
    const html = renderWithToast(
      <PhysicalFlashcard
        card={mockCard}
        isRevealed={false}
        onReveal={vi.fn()}
        onRate={vi.fn()}
        mode="scheduled-review"
        reviewSchedule={null}
        isSubmitting={false}
        submittingRating={null}
      />
    );

    expect(html).toContain("ephemeral");
    expect(html).toContain("CÂU HỎI");
    expect(html).toContain("Hiện đáp án");
    expect(html).toContain("Space");
  });

  it("renders back side with meaning and 4 FSRS rating buttons when revealed", () => {
    const html = renderWithToast(
      <PhysicalFlashcard
        card={mockCard}
        isRevealed={true}
        onReveal={vi.fn()}
        onRate={vi.fn()}
        mode="scheduled-review"
        reviewSchedule={null}
        isSubmitting={false}
        submittingRating={null}
      />
    );

    expect(html).toContain("is-flipped");
    expect(html).toContain("phù du, chóng tàn");
    expect(html).toContain("Again");
    expect(html).toContain("Hard");
    expect(html).toContain("Good");
    expect(html).toContain("Easy");
  });

  it("disables rating buttons when isSubmitting is true", () => {
    const html = renderWithToast(
      <PhysicalFlashcard
        card={mockCard}
        isRevealed={true}
        onReveal={vi.fn()}
        onRate={vi.fn()}
        mode="scheduled-review"
        reviewSchedule={null}
        isSubmitting={true}
        submittingRating={Rating.Good}
      />
    );

    expect(html).toContain("disabled");
  });

  it("renders free practice button when mode is free-practice", () => {
    const html = renderWithToast(
      <PhysicalFlashcard
        card={mockCard}
        isRevealed={true}
        onReveal={vi.fn()}
        onRate={vi.fn()}
        onNextFreePractice={vi.fn()}
        mode="free-practice"
        reviewSchedule={null}
        isSubmitting={false}
        submittingRating={null}
      />
    );

    expect(html).toContain("Thẻ tiếp theo");
    expect(html).not.toContain("Again");
  });
});
