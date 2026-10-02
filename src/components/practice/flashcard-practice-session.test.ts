import { describe, expect, it } from "vitest";
import {
  createFlashcardPracticeSession,
  type PracticeFlashcardData,
} from "./flashcard-practice-session";

const cards: PracticeFlashcardData[] = [
  { id: "card-1", term: "apple", meaningVi: "quả táo" },
  { id: "card-2", term: "banana", meaningVi: "quả chuối" },
  { id: "card-3", term: "cat", meaningVi: "con mèo" },
  { id: "card-4", term: "dog", meaningVi: "con chó" },
  { id: "card-5", term: "elephant", meaningVi: "con voi" },
];

describe("createFlashcardPracticeSession", () => {
  it("assigns EN → VI once to every card without changing the first-pass order", () => {
    const session = createFlashcardPracticeSession(cards, "en_vi");

    expect(session.map((item) => item.card.id)).toEqual(cards.map((card) => card.id));
    expect(session.every((item) => item.direction === "en_vi")).toBe(true);
  });

  it("assigns VI → EN once to every card without changing the first-pass order", () => {
    const session = createFlashcardPracticeSession(cards, "vi_en");

    expect(session.map((item) => item.card.id)).toEqual(cards.map((card) => card.id));
    expect(session.every((item) => item.direction === "vi_en")).toBe(true);
  });

  it("mixes both directions, keeps every card exactly once, and balances an odd session", () => {
    const session = createFlashcardPracticeSession(cards, "mix", () => 0.37);
    const enViCount = session.filter((item) => item.direction === "en_vi").length;
    const viEnCount = session.filter((item) => item.direction === "vi_en").length;

    expect(new Set(session.map((item) => item.card.id)).size).toBe(cards.length);
    expect(enViCount).toBeGreaterThan(0);
    expect(viEnCount).toBeGreaterThan(0);
    expect(Math.abs(enViCount - viEnCount)).toBeLessThanOrEqual(1);
  });

  it("handles a one-card mix session", () => {
    const session = createFlashcardPracticeSession(cards.slice(0, 1), "mix", () => 0.5);

    expect(session).toHaveLength(1);
    expect(session[0]?.card.id).toBe("card-1");
    expect(["en_vi", "vi_en"]).toContain(session[0]?.direction);
  });
});
