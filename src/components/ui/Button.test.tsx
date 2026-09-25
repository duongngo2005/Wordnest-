import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./Button";

describe("Button component", () => {
  it("renders with default variant and size classes", () => {
    const html = renderToStaticMarkup(<Button>Nhấn vào đây</Button>);
    expect(html).toContain("brick-button-secondary");
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("wn-tactile-btn");
    expect(html).toContain("Nhấn vào đây");
  });

  it("applies primary and danger variants correctly", () => {
    const primaryHtml = renderToStaticMarkup(<Button variant="primary">Lưu</Button>);
    expect(primaryHtml).toContain("brick-button-primary");

    const dangerHtml = renderToStaticMarkup(<Button variant="danger">Xóa</Button>);
    expect(dangerHtml).toContain("wn-button-danger");
  });

  it("renders loading state with disabled attribute, aria-busy and spinner", () => {
    const html = renderToStaticMarkup(
      <Button isLoading loadingText="Đang lưu...">
        Lưu
      </Button>
    );
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Đang lưu...");
    expect(html).not.toContain(">Lưu<");
  });

  it("renders leftIcon and rightIcon when provided", () => {
    const html = renderToStaticMarkup(
      <Button leftIcon={<span data-testid="left">←</span>} rightIcon={<span data-testid="right">→</span>}>
        Tiếp theo
      </Button>
    );
    expect(html).toContain('data-testid="left"');
    expect(html).toContain('data-testid="right"');
    expect(html).toContain("Tiếp theo");
  });
});
