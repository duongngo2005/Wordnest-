import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShadowingPlayer, type ShadowingPlayerSource } from "./ShadowingPlayer";

const baseSource: Omit<ShadowingPlayerSource, "type"> = {
  id: "source-1",
  deckId: "deck-1",
  title: "A short passage",
  content: "First sentence. Second sentence.",
};

function renderPlayer(type: ShadowingPlayerSource["type"]) {
  return renderToStaticMarkup(
    <ShadowingPlayer source={{ ...baseSource, type }} onExit={() => {}} />
  );
}

describe("ShadowingPlayer", () => {
  it("presents the optional listen-and-repeat routine with truthful text-match language", () => {
    const html = renderPlayer("story");

    expect(html).toContain("Nghe &amp; nói nhại");
    expect(html).toContain("Tùy chọn: nghe câu mẫu, nói nhại, rồi xem văn bản mà trình duyệt nhận diện.");
    expect(html).toContain("Khớp văn bản nhận diện với câu mẫu");
    expect(html).toContain("không đánh giá phát âm, giọng hay mức độ thành thạo");
    expect(html).not.toContain("Điểm phát âm");
  });

  it("uses a labelled section, a focusable player heading, semantic position progress, and native speed radios", () => {
    const html = renderPlayer("lesson");

    expect(html).toContain('<section aria-labelledby="shadowing-title"');
    expect(html).toContain('<h1 id="shadowing-title" tabindex="-1"');
    expect(html).toContain('<progress id="shadowing-progress"');
    expect(html).toContain('aria-label="Tiến độ câu"');
    expect(html).toContain('<fieldset');
    expect(html).toContain("Tốc độ câu mẫu");
    expect(html).toContain('type="radio"');
  });

  it("uses source-specific exit wording", () => {
    expect(renderPlayer("story")).toContain("Quay lại truyện");
    expect(renderPlayer("lesson")).toContain("Quay lại bài học");
  });
});
