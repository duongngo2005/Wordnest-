import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoryReader } from "./StoryReader";
import { ToastProvider } from "@/components/ui/ToastProvider";

describe("StoryReader Shadowing entry", () => {
  it("uses the clear listen-and-repeat entry copy instead of jargon-only copy", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <StoryReader
          story={{
            id: "story-1",
            deckId: "deck-1",
            title: "A Clear Story",
            content: "A short story sentence.",
            cefr: "B1",
            length: "short",
            topic: "Daily Life",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            vocabulary: {
              requestedTerms: [],
              usage: [],
              contextualTranslations: [],
              selectionTranslations: [],
              narration: { voiceIds: [] },
            },
          }}
          deckWords={[]}
          onStartShadowing={() => {}}
          readingMode
        />
      </ToastProvider>
    );

    expect(html).toContain("Nghe &amp; nói nhại (Shadowing)");
    expect(html).toContain('aria-label="Nghe và nói nhại"');
    expect(html).not.toContain(">Luyện Shadowing<");
  });
});
