import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ManualCardsEditor } from "./ManualCardsEditor";

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe("ManualCardsEditor", () => {
  it("keeps visible labels while leaving the form blank", () => {
    const html = renderToStaticMarkup(
      <ManualCardsEditor deckId="deck-1" onSaved={() => undefined} />
    );

    expect(html).toContain("Từ");
    expect(html).toContain("Nghĩa tiếng Việt");
    expect(html).toContain("Thông tin thêm");
    expect(html).toContain("Thêm thẻ");
    expect(html).not.toContain("placeholder=");
  });
});
