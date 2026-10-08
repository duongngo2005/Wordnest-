import { describe, expect, it } from "vitest";
import {
  computeDeckHeroRecommendation,
  DeckRecommendationInput,
} from "./deck-hero-recommendation";

describe("computeDeckHeroRecommendation", () => {
  const deckId = "deck-123";

  it("Case 0: returns EMPTY_DECK when totalCards is 0", () => {
    const input: DeckRecommendationInput = {
      deckId,
      totalCards: 0,
      dueCardsCount: 0,
      needPracticeCardsCount: 0,
      newCardsCount: 0,
    };

    const rec = computeDeckHeroRecommendation(input);

    expect(rec.type).toBe("EMPTY_DECK");
    expect(rec.primaryAction.actionType).toBe("OPEN_ADD_CARDS");
    expect(rec.primaryAction.label).toContain("Thêm từ");
  });

  it("Case 1: returns REVIEW_DUE when due > 0 and weak = 0", () => {
    const input: DeckRecommendationInput = {
      deckId,
      totalCards: 50,
      dueCardsCount: 12,
      needPracticeCardsCount: 0,
      newCardsCount: 5,
    };

    const rec = computeDeckHeroRecommendation(input);

    expect(rec.type).toBe("REVIEW_DUE");
    expect(rec.primaryAction.actionType).toBe("NAVIGATE");
    expect(rec.primaryAction.href).toBe(`/decks/${deckId}/study`);
    expect(rec.primaryAction.label).toContain("12 thẻ");
    expect(rec.secondaryAction).toBeUndefined();
  });

  it("Case 2: returns FOCUSED_PRACTICE when due = 0 and weak > 0", () => {
    const input: DeckRecommendationInput = {
      deckId,
      totalCards: 50,
      dueCardsCount: 0,
      needPracticeCardsCount: 4,
      newCardsCount: 10,
    };

    const rec = computeDeckHeroRecommendation(input);

    expect(rec.type).toBe("FOCUSED_PRACTICE");
    expect(rec.primaryAction.actionType).toBe("NAVIGATE");
    expect(rec.primaryAction.href).toBe(`/decks/${deckId}/quiz?mode=focused_practice`);
    expect(rec.primaryAction.label).toContain("4 từ");
    expect(rec.secondaryAction?.href).toBe(`/decks/${deckId}/mistakes`);
  });

  it("Case 3 (Strict Priority Invariant): REVIEW WINS when due > 0 and weak > 0", () => {
    const input: DeckRecommendationInput = {
      deckId,
      totalCards: 50,
      dueCardsCount: 7,
      needPracticeCardsCount: 5,
      newCardsCount: 2,
    };

    const rec = computeDeckHeroRecommendation(input);

    // FSRS Due memory review must ALWAYS win over practice remediation!
    expect(rec.type).toBe("REVIEW_DUE");
    expect(rec.primaryAction.href).toBe(`/decks/${deckId}/study`);
    expect(rec.primaryAction.label).toContain("7 thẻ");
    // Secondary action offers access to weak practice
    expect(rec.secondaryAction?.href).toBe(`/decks/${deckId}/quiz?mode=focused_practice`);
    expect(rec.secondaryAction?.label).toContain("5 từ");
  });

  it("Case 4: returns LEARN_NEW when due = 0, weak = 0, and new > 0", () => {
    const input: DeckRecommendationInput = {
      deckId,
      totalCards: 50,
      dueCardsCount: 0,
      needPracticeCardsCount: 0,
      newCardsCount: 15,
    };

    const rec = computeDeckHeroRecommendation(input);

    expect(rec.type).toBe("LEARN_NEW");
    expect(rec.primaryAction.actionType).toBe("NAVIGATE");
    expect(rec.primaryAction.href).toBe(`/decks/${deckId}/study`);
    expect(rec.primaryAction.label).toBe("Học từ mới (15 từ)");
    expect(rec.title).toContain("Còn 15 từ mới");
    expect(rec.secondaryAction?.href).toBe(`/decks/${deckId}/quiz`);
  });

  it("Case 4b: honestly caps CTA label to 20 when newCardsCount > 20", () => {
    const input: DeckRecommendationInput = {
      deckId,
      totalCards: 100,
      dueCardsCount: 0,
      needPracticeCardsCount: 0,
      newCardsCount: 80,
    };

    const rec = computeDeckHeroRecommendation(input);

    expect(rec.type).toBe("LEARN_NEW");
    expect(rec.primaryAction.label).toBe("Học 20 từ mới tiếp theo");
    expect(rec.title).toBe("Còn 80 từ mới chưa học");
    expect(rec.description).toContain("Mỗi phiên học sẽ nạp 20 từ");
  });

  it("Case 5: returns READ_CONTEXT when all caught up (due = 0, weak = 0, new = 0)", () => {
    const input: DeckRecommendationInput = {
      deckId,
      totalCards: 50,
      dueCardsCount: 0,
      needPracticeCardsCount: 0,
      newCardsCount: 0,
    };

    const rec = computeDeckHeroRecommendation(input);

    expect(rec.type).toBe("READ_CONTEXT");
    expect(rec.primaryAction.actionType).toBe("OPEN_READING_HUB");
    expect(rec.primaryAction.label).toContain("Đọc");
    expect(rec.secondaryAction?.href).toBe(`/decks/${deckId}/quiz`);
  });

  it("safely handles negative numbers by clamping to 0", () => {
    const input: DeckRecommendationInput = {
      deckId,
      totalCards: -5,
      dueCardsCount: -1,
      needPracticeCardsCount: -2,
      newCardsCount: -3,
    };

    const rec = computeDeckHeroRecommendation(input);
    expect(rec.type).toBe("EMPTY_DECK");
  });
});
