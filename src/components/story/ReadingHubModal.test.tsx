import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReadingHubModal } from "./ReadingHubModal";

describe("ReadingHubModal", () => {
  it("renders null when open is false", () => {
    const html = renderToStaticMarkup(
      <ReadingHubModal
        open={false}
        deckId="deck-1"
        deckName="IELTS Core"
        onClose={vi.fn()}
      />
    );
    expect(html).toBe("");
  });

  it("renders truthful Story and Lesson pathways when open", () => {
    const html = renderToStaticMarkup(
      <ReadingHubModal
        open={true}
        deckId="deck-1"
        deckName="IELTS Core"
        onClose={vi.fn()}
      />
    );

    // Dialog structure
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-labelledby="reading-hub-title"');
    expect(html).toContain("Không gian đọc &amp; ngữ cảnh");
    expect(html).toContain("IELTS Core");
    expect(html).toContain("Chọn cách học từ qua một bài đọc.");
    expect(html).toContain('aria-label="Đóng cửa sổ Đọc &amp; Ngữ cảnh"');

    // Pathway 1: Story
    expect(html).toContain(">Truyện</h3>");
    expect(html).toContain(
      "Đọc nội dung linh hoạt, khám phá từ trong ngữ cảnh, nghe và luyện tập sau khi đọc."
    );
    expect(html).toContain('href="/decks/deck-1/story"');
    expect(html).toContain('href="/decks/deck-1/story?create=ai"');

    // Pathway 2: AI Lesson
    expect(html).toContain(">Bài học</h3>");
    expect(html).toContain(
      "Bài đọc ngắn, tập trung vào nhóm từ đã chọn và cách dùng chúng trong ngữ cảnh."
    );
    expect(html).toContain('href="/decks/deck-1/lesson"');
    expect(html).toContain("Tạo bài học AI mới");
    expect(html).not.toContain("hội thoại tình huống");
    expect(html).not.toContain("collocations");
    expect(html).not.toContain("bài tập thực hành ngữ pháp");
  });
});
