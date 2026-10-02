import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WordNestMascot } from "./Mascot";

describe("WordNestMascot component", () => {
  it("renders with default happy mood and accessible role", () => {
    const html = renderToStaticMarkup(<WordNestMascot mood="happy" />);
    expect(html).toContain("Linh vật WordNest: Nesty đang nghỉ ngơi vui vẻ");
    expect(html).toContain("bird-character");
  });

  it("renders with aria-hidden when ariaHidden is true", () => {
    const html = renderToStaticMarkup(<WordNestMascot mood="reading" ariaHidden={true} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("Linh vật WordNest:");
  });

  it("renders mini-book only when mood is reading", () => {
    const readingHtml = renderToStaticMarkup(<WordNestMascot mood="reading" />);
    expect(readingHtml).toContain('id="mini-book"');

    const happyHtml = renderToStaticMarkup(<WordNestMascot mood="happy" />);
    expect(happyHtml).not.toContain('id="mini-book"');
  });

  it("renders thinking and celebrating moods with proper label context", () => {
    const thinkingHtml = renderToStaticMarkup(<WordNestMascot mood="thinking" />);
    expect(thinkingHtml).toContain("Nesty đang tập trung suy nghĩ");

    const celebratingHtml = renderToStaticMarkup(<WordNestMascot mood="celebrating" />);
    expect(celebratingHtml).toContain("Nesty vui mừng vì hoàn thành bài học");
  });

  it("renders the official Dino sprite when Dino is explicitly selected", () => {
    const html = renderToStaticMarkup(<WordNestMascot mascot="dino" />);

    expect(html).toContain("/mascots/dino-directions.webp");
    expect(html).toContain("Dino, linh vật WordNest");
  });

  it("renders the official Knight sprite when Knight is explicitly selected", () => {
    const html = renderToStaticMarkup(<WordNestMascot mascot="knight" interactive />);

    expect(html).toContain("/mascots/knight-directions.webp");
    expect(html).toContain("/mascots/knight-reactions.webp");
    expect(html).toContain("Knight, linh vật WordNest");
  });
});
