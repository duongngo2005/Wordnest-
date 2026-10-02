import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PracticeFlashcard } from "./PracticeFlashcard";
import type { PracticeCardSessionItem } from "./flashcard-practice-session";
import { ToastProvider } from "@/components/ui/ToastProvider";

const card = {
  id: "card-1",
  term: "ephemeral",
  meaningVi: "phù du, chóng tàn",
  definitionEn: "lasting for a very short time",
  ipa: "/ɪˈfem.ər.əl/",
  partOfSpeech: "adjective",
  exampleEn: "Fame can be ephemeral.",
  exampleVi: "Danh tiếng có thể chóng tàn.",
  imageUrl: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E",
  imageAuthor: "WordNest",
  imageSource: "Minh họa",
};

function renderCard(item: PracticeCardSessionItem, isRevealed: boolean) {
  return renderToStaticMarkup(
    <ToastProvider>
      <PracticeFlashcard
        item={item}
        isRevealed={isRevealed}
        onReveal={vi.fn()}
        onRate={vi.fn()}
      />
    </ToastProvider>
  );
}

describe("PracticeFlashcard", () => {
  it("keeps EN → VI front limited to English and front audio until reveal", () => {
    const html = renderCard({ card, direction: "en_vi" }, false);

    expect(html).toContain("ephemeral");
    expect(html).toContain('aria-label="Phát âm &quot;ephemeral&quot;"');
    expect(html).toContain("Hiện đáp án");
    expect(html).not.toContain("phù du, chóng tàn");
    expect(html).not.toContain("data-testid=\"practice-back-image\"");
    expect(html).not.toContain("Chưa nhớ");
    expect(html).not.toContain("Đã nhớ");
  });

  it("shows all available back details, image, pronunciation, and self-rating after EN → VI reveal", () => {
    const html = renderCard({ card, direction: "en_vi" }, true);

    expect(html).toContain("ephemeral");
    expect(html).toContain("phù du, chóng tàn");
    expect(html).toContain("lasting for a very short time");
    expect(html).toContain("Fame can be ephemeral.");
    expect(html).toContain("Danh tiếng có thể chóng tàn.");
    expect(html).toContain("data-testid=\"practice-back-image\"");
    expect(html).toContain('aria-label="Phát âm &quot;ephemeral&quot;"');
    expect(html).toContain("Chưa nhớ");
    expect(html).toContain("Đã nhớ");
  });

  it("does not leak English, audio, image, or hidden answer controls on the VI → EN front", () => {
    const html = renderCard({ card, direction: "vi_en" }, false);

    expect(html).toContain("phù du, chóng tàn");
    expect(html).toContain("adjective");
    expect(html).not.toContain("ephemeral");
    expect(html).not.toContain("Phát âm");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Chưa nhớ");
    expect(html).not.toContain("Đã nhớ");
  });

  it("reveals the English term and pronunciation on the VI → EN back", () => {
    const html = renderCard({ card, direction: "vi_en" }, true);

    expect(html).toContain("ephemeral");
    expect(html).toContain('aria-label="Phát âm &quot;ephemeral&quot;"');
    expect(html).toContain("data-testid=\"practice-back-image\"");
    expect(html).toContain("Chưa nhớ");
    expect(html).toContain("Đã nhớ");
  });

  it("renders CEFR badge on front and back when card has CEFR level", () => {
    const cardWithCefr = { ...card, cefr: "B2" };
    const frontHtml = renderCard({ card: cardWithCefr, direction: "en_vi" }, false);
    expect(frontHtml).toContain("CEFR");
    expect(frontHtml).toContain("B2");

    const backHtml = renderCard({ card: cardWithCefr, direction: "en_vi" }, true);
    expect(backHtml).toContain("B2");
  });
});
