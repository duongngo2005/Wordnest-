import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CefrBadge, getCefrColor } from "./CefrBadge";

describe("CefrBadge component", () => {
  it("renders null when level is empty or null", () => {
    expect(renderToStaticMarkup(<CefrBadge level={null} />)).toBe("");
    expect(renderToStaticMarkup(<CefrBadge level="" />)).toBe("");
  });

  it("renders normalized level with correct colors", () => {
    const htmlA = renderToStaticMarkup(<CefrBadge level="a2" />);
    expect(htmlA).toContain("A2");
    expect(htmlA).toContain("bg-[#DCFCE7]");

    const htmlB = renderToStaticMarkup(<CefrBadge level="B1" showPrefix />);
    expect(htmlB).toContain("B1");
    expect(htmlB).toContain("CEFR");
    expect(htmlB).toContain("bg-[#FEF3C7]");

    const htmlC = renderToStaticMarkup(<CefrBadge level="c2" size="sm" />);
    expect(htmlC).toContain("C2");
    expect(htmlC).toContain("bg-[#FEE2E2]");
  });

  it("handles fallback gracefully", () => {
    const fallback = getCefrColor("unknown");
    expect(fallback.bg).toBe("bg-[#F4EFE6]");
  });
});
