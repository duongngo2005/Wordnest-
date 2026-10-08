import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getPostcardState, TodayPostcard } from "./TodayPostcard";
import type { TodayDeckState } from "@/lib/today-learning-plan";

function renderPostcard(props: React.ComponentProps<typeof TodayPostcard>) {
  return renderToStaticMarkup(React.createElement(TodayPostcard, props));
}

describe("TodayPostcard logic and state mappings", () => {
  const testDate = new Date("2026-09-24T12:00:00Z");

  it("returns 'due' state with reading mascot and due quote when cards are waiting", () => {
    const state = getPostcardState(8, 0, testDate);
    expect(state.type).toBe("due");
    expect(state.mascotMood).toBe("reading");
    expect(typeof state.quote).toBe("string");
    expect(state.quote.length).toBeGreaterThan(0);
  });

  it("returns 'in_progress' state with thinking mascot when studying is in progress", () => {
    const state = getPostcardState(5, 3, testDate);
    expect(state.type).toBe("in_progress");
    expect(state.mascotMood).toBe("thinking");
    expect(typeof state.quote).toBe("string");
    expect(state.quote.length).toBeGreaterThan(0);
  });

  it("returns 'completed' state with celebrating mascot when all cards for today are done", () => {
    const state = getPostcardState(0, 11, testDate);
    expect(state.type).toBe("completed");
    expect(state.mascotMood).toBe("celebrating");
    expect(typeof state.quote).toBe("string");
    expect(state.quote.length).toBeGreaterThan(0);
  });

  it("returns 'clean_slate' state with happy mascot when there are 0 cards due and 0 reviewed", () => {
    const state = getPostcardState(0, 0, testDate);
    expect(state.type).toBe("clean_slate");
    expect(state.mascotMood).toBe("happy");
    expect(typeof state.quote).toBe("string");
    expect(state.quote.length).toBeGreaterThan(0);
  });

  it("yields consistent deterministic quotes for the same date", () => {
    const state1 = getPostcardState(4, 2, testDate);
    const state2 = getPostcardState(4, 2, testDate);
    expect(state1.quote).toBe(state2.quote);
  });

  it("renders one global due-now action that links to existing global review", () => {
    const html = renderPostcard({
      plan: { kind: "DUE", dueCount: 40, dueDeckCount: 3 },
      reviewedTodayCount: 0,
      secondaryDecks: [],
      secondaryDecksRemainingCount: 0,
      date: testDate,
    });

    expect(html).toContain("Ôn 40 thẻ đến hạn");
    expect(html).toContain('href="/review"');
    expect(html).toContain("trong 3 bộ từ");
  });

  it("keeps weak action deck-scoped and describes it as practice evidence, not mastery", () => {
    const weakDeck: TodayDeckState = {
      deckId: "deck-weak",
      deckName: "Từ học thuật",
      stableOrder: 0,
      totalCards: 30,
      dueCount: 0,
      weakCount: 7,
      newCount: 0,
    };
    const html = renderPostcard({
      plan: { kind: "WEAK", deck: weakDeck },
      reviewedTodayCount: 0,
      secondaryDecks: [],
      secondaryDecksRemainingCount: 0,
      date: testDate,
    });

    expect(html).toContain("Củng cố 7 từ cần luyện");
    expect(html).toContain("Từ học thuật");
    expect(html).toContain('href="/decks/deck-weak/quiz?mode=focused_practice"');
    expect(html).not.toContain("thành thạo");
  });

  it("renders the existing deck routes for new, contextual, and empty recommendations", () => {
    const baseDeck: TodayDeckState = {
      deckId: "deck-next",
      deckName: "Bộ từ kế tiếp",
      stableOrder: 0,
      totalCards: 12,
      dueCount: 0,
      weakCount: 0,
      newCount: 12,
    };

    const newHtml = renderPostcard({
      plan: { kind: "NEW", deck: baseDeck },
      reviewedTodayCount: 0,
      secondaryDecks: [],
      secondaryDecksRemainingCount: 0,
      date: testDate,
    });
    const contextHtml = renderPostcard({
      plan: { kind: "CONTEXT", deck: { ...baseDeck, newCount: 0 } },
      reviewedTodayCount: 0,
      secondaryDecks: [],
      secondaryDecksRemainingCount: 0,
      date: testDate,
    });
    const emptyHtml = renderPostcard({
      plan: { kind: "EMPTY", deck: { ...baseDeck, totalCards: 0, newCount: 0 } },
      reviewedTodayCount: 0,
      secondaryDecks: [],
      secondaryDecksRemainingCount: 0,
      date: testDate,
    });

    expect(newHtml).toContain("Có 12 từ mới đang chờ");
    expect(newHtml).toContain('href="/decks/deck-next/study"');
    expect(contextHtml).toContain("Hiện không có thẻ cần ôn hay từ cần củng cố.");
    expect(contextHtml).toContain('href="/decks/deck-next"');
    expect(contextHtml).not.toContain("thành thạo");
    expect(emptyHtml).toContain("Thêm từ để bắt đầu");
    expect(emptyHtml).toContain('href="/decks/deck-next"');
  });

  it("renders only bounded secondary deck context", () => {
    const secondaryDecks = Array.from({ length: 3 }, (_, index) => ({
      deck: {
        deckId: `deck-${index}`,
        deckName: `Deck ${index}`,
        stableOrder: index,
        totalCards: 10,
        dueCount: 0,
        weakCount: 0,
        newCount: index + 1,
      },
      status: "NEW" as const,
    }));
    const html = renderPostcard({
      plan: { kind: "CONTEXT", deck: secondaryDecks[0].deck },
      reviewedTodayCount: 0,
      secondaryDecks,
      secondaryDecksRemainingCount: 7,
      date: testDate,
    });

    expect(html).toContain('aria-label="Tóm tắt các bộ từ khác"');
    expect(html.match(/class="wn-postcard__secondary-item/g)).toHaveLength(3);
    expect(html).toContain("+ 7 bộ từ khác");
  });
});
