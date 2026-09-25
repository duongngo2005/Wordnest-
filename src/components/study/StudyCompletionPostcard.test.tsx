import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyCompletionPostcard } from "./StudyCompletionPostcard";

vi.mock("@/lib/ui-sound", () => ({
  playUISound: vi.fn(),
}));

vi.mock("@/lib/celebration-confetti", () => ({
  fireSessionCompletionConfetti: vi.fn(),
}));

describe("StudyCompletionPostcard component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders completion postcard with deck name, session stats and accuracy", () => {
    const html = renderToStaticMarkup(
      <StudyCompletionPostcard
        deckId="deck-123"
        deckName="IELTS Advanced"
        mode="scheduled-review"
        sessionAgain={1}
        sessionHard={2}
        sessionGood={5}
        sessionEasy={2}
        saveError={null}
        onRestart={vi.fn()}
      />
    );

    expect(html).toContain("Hoàn thành buổi ôn!");
    expect(html).toContain("IELTS Advanced");
    expect(html).toContain("ĐÃ HOÀN TẤT HÔM NAY");

    expect(html).toContain("10 lượt ôn");
    expect(html).toContain("Again");
    expect(html).toContain("Good");
    expect(html).not.toMatch(/retention|mastery|tỷ lệ ghi nhớ|độ ghi nhớ/i);

    // Action buttons
    expect(html).toContain("Quay lại danh sách thẻ");
    expect(html).toContain("Xem lại hàng đợi");
  });

  it("renders save error message when saveError is present", () => {
    const html = renderToStaticMarkup(
      <StudyCompletionPostcard
        deckId="deck-123"
        deckName="IELTS Advanced"
        mode="scheduled-review"
        sessionAgain={0}
        sessionHard={0}
        sessionGood={0}
        sessionEasy={0}
        saveError="Mất kết nối mạng tạm thời"
        onRestart={vi.fn()}
      />
    );

    expect(html).toContain("Mất kết nối mạng tạm thời");
  });
});
