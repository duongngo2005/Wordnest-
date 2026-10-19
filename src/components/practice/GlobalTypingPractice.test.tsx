import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GlobalTypingPractice } from "./GlobalTypingPractice";

describe("GlobalTypingPractice", () => {
  it("starts with a clear global source, adaptive default, and bounded session counts", () => {
    const html = renderToStaticMarkup(<GlobalTypingPractice />);

    expect(html).toContain("Luyện gõ");
    expect(html).toContain("toàn bộ hồ sơ canonical trong thư viện");
    expect(html).toContain("Trộn toàn bộ từ");
    expect(html).toContain("Tập trung từ hay sai");
    expect(html).toContain("Ôn lại từ sai phiên vừa học");
    expect(html).toContain(">10<");
    expect(html).toContain(">20<");
    expect(html).toContain(">50<");
    expect(html).toContain("Lần trả lời đầu tiên được ghi nhận riêng");
  });

  it("renders a distinct due-only entry without global queue choices", () => {
    const html = renderToStaticMarkup(<GlobalTypingPractice source="due" />);

    expect(html).toContain("Luyện gõ · Từ đến hạn");
    expect(html).toContain("Chỉ dùng các thẻ đang đến hạn tại thời điểm bắt đầu phiên.");
    expect(html).toContain("Bắt đầu luyện gõ từ đến hạn");
    expect(html).not.toContain("Trộn toàn bộ từ");
  });
});
