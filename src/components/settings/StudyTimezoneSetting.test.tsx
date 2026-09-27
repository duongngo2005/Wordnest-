import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyTimezoneSetting } from "./StudyTimezoneSetting";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

describe("StudyTimezoneSetting component", () => {
  it("renders heading and study timezone explanation", () => {
    const html = renderToStaticMarkup(<StudyTimezoneSetting />);
    expect(html).toContain("Múi giờ ngày học");
    expect(html).toContain("Dùng để xác định mốc sang ngày mới");
  });

  it("renders mode toggle options and timezone options", () => {
    const html = renderToStaticMarkup(<StudyTimezoneSetting />);
    expect(html).toContain("Theo thiết bị");
    expect(html).toContain("Tùy chọn thủ công");
    expect(html).toContain("Việt Nam (Hà Nội, TP.HCM)");
    expect(html).toContain("Asia/Ho_Chi_Minh");
    expect(html).toContain("GMT+7");
  });
});
