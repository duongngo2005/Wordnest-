import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LessonReader } from "./LessonReader";
import { ToastProvider } from "@/components/ui/ToastProvider";

describe("LessonReader vocabulary controls", () => {
  it("uses a keyboard-operable button for each selectable vocabulary card", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <LessonReader
          deck={{ id: "deck-1", name: "Từ vựng công việc" }}
          lesson={{
            id: "lesson-1",
            deckId: "deck-1",
            title: "A Productive Day",
            content: "They adapt quickly to the new work process.",
            cefr: "B1",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            targetWords: {
              schemaVersion: 3,
              requestedTerms: ["adapt"],
              usage: [{ term: "adapt", usedAs: "adapt" }],
              contextualTranslations: [
                { term: "adapt", usedAs: "adapt", meaningVi: "thích nghi" },
              ],
              selectionTranslations: [],
            },
          }}
        />
      </ToastProvider>
    );

    expect(html).toContain('aria-label="Xem ngữ cảnh của adapt"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("uses the same clear optional Shadowing entry label as Story", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <LessonReader
          deck={{ id: "deck-1", name: "Từ vựng công việc" }}
          lesson={{
            id: "lesson-1",
            deckId: "deck-1",
            title: "A Productive Day",
            content: "They adapt quickly to the new work process.",
            cefr: "B1",
            targetWords: { schemaVersion: 3, requestedTerms: [], usage: [], contextualTranslations: [], selectionTranslations: [] },
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }}
          onStartShadowing={() => {}}
        />
      </ToastProvider>
    );

    expect(html).toContain("Nghe &amp; nói nhại (Shadowing)");
    expect(html).not.toContain(">Luyện Shadowing<");
  });
});
