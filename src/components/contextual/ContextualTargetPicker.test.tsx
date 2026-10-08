import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextualTargetPicker } from "./ContextualTargetPicker";

const words = [
  { id: "A", term: "allocate", meaningVi: "phân bổ" },
  { id: "B", term: "context", meaningVi: "ngữ cảnh" },
  { id: "C", term: "review", meaningVi: "ôn lại" },
];

describe("ContextualTargetPicker", () => {
  it("renders the shared General, Weak and Manual mental model with semantic controls", () => {
    const html = renderToStaticMarkup(
      <ContextualTargetPicker
        idPrefix="test"
        words={words}
        weakWordIds={["C"]}
        selectedIds={["A", "B", "C"]}
        intent="weak"
        maxSelectedIds={20}
        onIntentChange={vi.fn()}
        onToggleWord={vi.fn()}
        onSelectAll={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(html).toContain("Chọn giúp tôi");
    expect(html).toContain("Củng cố từ cần luyện");
    expect(html).toContain("Tự chọn từ");
    expect(html).toContain("Dùng những từ bạn đang có bằng chứng cần luyện thêm.");
    expect(html).toContain('type="radio"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('for="test-target-search"');
    expect(html).toContain("Đã chọn 3/20 từ.");
  });

  it("makes Lesson weak overflow explicit instead of silently presenting all candidates as selected", () => {
    const manyWords = Array.from({ length: 35 }, (_, index) => ({
      id: `card-${index + 1}`,
      term: `term-${index + 1}`,
      meaningVi: `nghĩa ${index + 1}`,
    }));
    const html = renderToStaticMarkup(
      <ContextualTargetPicker
        idPrefix="lesson"
        words={manyWords}
        weakWordIds={manyWords.map((word) => word.id)}
        selectedIds={manyWords.slice(0, 20).map((word) => word.id)}
        intent="weak"
        maxSelectedIds={20}
        overflowCount={15}
        onIntentChange={vi.fn()}
        onToggleWord={vi.fn()}
        onSelectAll={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(html).toContain("Đã chọn 20/35 từ cần luyện vì bài học hỗ trợ tối đa 20 từ.");
  });

  it("states that no-evidence decks do not have weak targets while General remains available", () => {
    const html = renderToStaticMarkup(
      <ContextualTargetPicker
        idPrefix="empty-weak"
        words={words}
        selectedIds={words.map((word) => word.id)}
        intent="general"
        onIntentChange={vi.fn()}
        onToggleWord={vi.fn()}
        onSelectAll={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(html).toContain("Hiện chưa có từ cần củng cố.");
    expect(html).toContain("Chọn một nhóm từ nhỏ để bắt đầu bài đọc.");
  });
});
