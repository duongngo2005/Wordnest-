import { describe, expect, it } from "vitest";
import {
  CONTEXTUAL_GENERAL_TARGET_COUNT,
  LESSON_CONTEXTUAL_TARGET_LIMIT,
  resolveContextualTargetSelection,
  resolveStoryTargetTerms,
  toggleContextualTargetId,
} from "./contextual-target-selection";

const deckIds = ["A", "B", "C", "D", "E", "F", "G"];

describe("contextual target selection", () => {
  it("selects the first five deck cards for General exposure without consulting weak cards", () => {
    const result = resolveContextualTargetSelection({
      intent: "general",
      deckCardIds: deckIds,
      weakCardIds: ["F", "G"],
    });

    expect(CONTEXTUAL_GENERAL_TARGET_COUNT).toBe(5);
    expect(result.selectedIds).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("keeps every available card for small decks", () => {
    expect(
      resolveContextualTargetSelection({ intent: "general", deckCardIds: ["A", "B", "C"] })
        .selectedIds
    ).toEqual(["A", "B", "C"]);
  });

  it("uses existing weak order, never legacy or insufficient-data candidates supplied outside it", () => {
    const result = resolveContextualTargetSelection({
      intent: "weak",
      deckCardIds: deckIds,
      weakCardIds: ["G", "C", "F"],
    });

    expect(result.selectedIds).toEqual(["G", "C", "F"]);
  });

  it("bounds Lesson weak selection transparently while Story remains uncapped", () => {
    const manyIds = Array.from({ length: 35 }, (_, index) => `card-${index + 1}`);

    const lesson = resolveContextualTargetSelection({
      intent: "weak",
      deckCardIds: manyIds,
      weakCardIds: manyIds,
      maxSelectedIds: LESSON_CONTEXTUAL_TARGET_LIMIT,
    });
    const story = resolveContextualTargetSelection({
      intent: "weak",
      deckCardIds: manyIds,
      weakCardIds: manyIds,
    });

    expect(lesson.selectedIds).toHaveLength(20);
    expect(lesson.overflowCount).toBe(15);
    expect(story.selectedIds).toEqual(manyIds);
    expect(story.overflowCount).toBe(0);
  });

  it("normalizes manual input by removing stale IDs and duplicates while preserving first occurrence", () => {
    const result = resolveContextualTargetSelection({
      intent: "manual",
      deckCardIds: deckIds,
      manualIds: ["C", "missing", "A", "C", "B"],
    });

    expect(result.selectedIds).toEqual(["C", "A", "B"]);
    expect(result.ignoredUnknownIds).toEqual(["missing"]);
    expect(result.duplicateCount).toBe(1);
  });

  it("applies the Lesson limit after deduplication without creating an invalid initial state", () => {
    const ids = Array.from({ length: 25 }, (_, index) => `card-${index + 1}`);
    const result = resolveContextualTargetSelection({
      intent: "manual",
      deckCardIds: ids,
      manualIds: [...ids, "card-1"],
      maxSelectedIds: LESSON_CONTEXTUAL_TARGET_LIMIT,
    });

    expect(result.selectedIds).toEqual(ids.slice(0, 20));
    expect(result.duplicateCount).toBe(1);
    expect(result.overflowCount).toBe(5);
  });

  it("keeps Lesson manual selection valid when a learner tries to add item 21", () => {
    const ids = Array.from({ length: 21 }, (_, index) => `card-${index + 1}`);
    const result = toggleContextualTargetId({
      selectedIds: ids.slice(0, 20),
      targetId: ids[20],
      deckCardIds: ids,
      maxSelectedIds: LESSON_CONTEXTUAL_TARGET_LIMIT,
    });

    expect(result.limitReached).toBe(true);
    expect(result.selectedIds).toEqual(ids.slice(0, 20));
  });

  it("adapts Story selection IDs back to terms in selection order", () => {
    expect(
      resolveStoryTargetTerms(
        [
          { id: "A", term: "allocate" },
          { id: "B", term: "context" },
          { id: "C", term: "review" },
        ],
        ["C", "A", "B"]
      )
    ).toEqual(["review", "allocate", "context"]);
  });
});
