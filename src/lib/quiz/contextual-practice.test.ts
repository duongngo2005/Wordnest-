import { describe, expect, it } from "vitest";
import {
  getContextualPracticeSource,
  getContextualPracticeRestartHref,
  getTargetedFocusedPracticeHref,
  getWrongVocabularyCardIdsFromFirstPass,
  type ContextualResultRecord,
} from "./contextual-practice";

function record(
  type: ContextualResultRecord["question"]["type"],
  cardId: string,
  isCorrect: boolean
): ContextualResultRecord {
  return {
    isCorrect,
    question: { type, cardId },
  };
}

describe("contextual practice result contract", () => {
  it("builds exact return routes only for contextual practice with a source id", () => {
    expect(
      getContextualPracticeSource({
        deckId: "deck-1",
        mode: "story_practice",
        storyId: "story-1",
      })
    ).toEqual({
      type: "story",
      id: "story-1",
      returnHref: "/decks/deck-1/story?storyId=story-1",
      returnLabel: "Quay lại truyện",
    });

    expect(
      getContextualPracticeSource({
        deckId: "deck-1",
        mode: "lesson_practice",
        lessonId: "lesson-1",
      })
    ).toEqual({
      type: "lesson",
      id: "lesson-1",
      returnHref: "/decks/deck-1/lesson?lessonId=lesson-1",
      returnLabel: "Quay lại bài học",
    });

    expect(
      getContextualPracticeSource({ deckId: "deck-1", mode: "multiple_choice" })
    ).toBeNull();
    expect(
      getContextualPracticeSource({ deckId: "deck-1", mode: "focused_practice" })
    ).toBeNull();
    expect(
      getContextualPracticeSource({ deckId: "deck-1", mode: "story_practice" })
    ).toBeNull();
  });

  it("keeps only distinct failed vocabulary cards from the first pass", () => {
    const firstPassRecords = [
      record("story_comprehension", "", false),
      record("story_contextual_vocab", "card-a", false),
      record("story_cloze", "card-b", false),
      record("story_contextual_vocab", "card-c", true),
      record("story_contextual_vocab", "card-a", false),
    ];

    expect(getWrongVocabularyCardIdsFromFirstPass(firstPassRecords)).toEqual([
      "card-a",
      "card-b",
    ]);
  });

  it("keeps a first-pass failure targetable even after a separate retry succeeds", () => {
    const firstPassRecords = [record("story_cloze", "card-a", false)];
    const retryRecords = [record("story_cloze", "card-a", true)];

    expect(retryRecords[0].isCorrect).toBe(true);
    expect(getWrongVocabularyCardIdsFromFirstPass(firstPassRecords)).toEqual(["card-a"]);
  });

  it("uses the existing targeted Focused Practice query contract", () => {
    expect(getTargetedFocusedPracticeHref("deck-1", ["card-a", "card-b"])).toBe(
      "/decks/deck-1/quiz?mode=focused_practice&cardIds=card-a,card-b"
    );
    expect(getTargetedFocusedPracticeHref("deck-1", [])).toBeNull();
  });

  it("preserves the originating source when restarting contextual practice", () => {
    const storySource = getContextualPracticeSource({
      deckId: "deck-1",
      mode: "story_practice",
      storyId: "story-1",
    });
    const lessonSource = getContextualPracticeSource({
      deckId: "deck-1",
      mode: "lesson_practice",
      lessonId: "lesson-1",
    });

    expect(storySource).not.toBeNull();
    expect(lessonSource).not.toBeNull();
    expect(getContextualPracticeRestartHref("deck-1", storySource!)).toBe(
      "/api/decks/deck-1/quiz?mode=story_practice&storyId=story-1"
    );
    expect(getContextualPracticeRestartHref("deck-1", lessonSource!)).toBe(
      "/api/decks/deck-1/quiz?mode=lesson_practice&lessonId=lesson-1"
    );
  });
});
