import type { QuizQuestion, QuizQuestionType } from "@/services/vocabulary/quiz-service";

export type ContextualPracticeSource =
  | {
      type: "story";
      id: string;
      returnHref: string;
      returnLabel: "Quay lại truyện";
    }
  | {
      type: "lesson";
      id: string;
      returnHref: string;
      returnLabel: "Quay lại bài học";
    };

export interface ContextualResultRecord {
  isCorrect: boolean;
  question: Pick<QuizQuestion, "cardId" | "type">;
}

interface ContextualPracticeSourceInput {
  deckId: string;
  mode: string;
  storyId?: string;
  lessonId?: string;
}

const CONTEXTUAL_VOCABULARY_QUESTION_TYPES = new Set<QuizQuestionType>([
  "story_contextual_vocab",
  "story_cloze",
]);

function getSourceId(sourceId: string | undefined): string | null {
  const normalizedSourceId = sourceId?.trim();
  return normalizedSourceId || null;
}

function getContextualSourceHref(
  deckId: string,
  sourceType: "story" | "lesson",
  sourceId: string
): string {
  const sourceQueryKey = sourceType === "story" ? "storyId" : "lessonId";
  return `/decks/${encodeURIComponent(deckId)}/${sourceType}?${sourceQueryKey}=${encodeURIComponent(sourceId)}`;
}

export function getContextualPracticeSource({
  deckId,
  mode,
  storyId,
  lessonId,
}: ContextualPracticeSourceInput): ContextualPracticeSource | null {
  if (mode === "story_practice") {
    const sourceId = getSourceId(storyId);
    if (!sourceId) return null;

    return {
      type: "story",
      id: sourceId,
      returnHref: getContextualSourceHref(deckId, "story", sourceId),
      returnLabel: "Quay lại truyện",
    };
  }

  if (mode === "lesson_practice") {
    const sourceId = getSourceId(lessonId);
    if (!sourceId) return null;

    return {
      type: "lesson",
      id: sourceId,
      returnHref: getContextualSourceHref(deckId, "lesson", sourceId),
      returnLabel: "Quay lại bài học",
    };
  }

  return null;
}

export function getContextualPracticeRestartHref(
  deckId: string,
  source: ContextualPracticeSource
): string {
  const sourceQueryKey = source.type === "story" ? "storyId" : "lessonId";
  return `/api/decks/${encodeURIComponent(deckId)}/quiz?mode=${source.type}_practice&${sourceQueryKey}=${encodeURIComponent(source.id)}`;
}

export function getWrongVocabularyCardIdsFromFirstPass(
  firstPassRecords: readonly ContextualResultRecord[]
): string[] {
  const cardIds = new Set<string>();

  for (const record of firstPassRecords) {
    const cardId = record.question.cardId.trim();
    if (
      record.isCorrect ||
      !cardId ||
      !CONTEXTUAL_VOCABULARY_QUESTION_TYPES.has(record.question.type)
    ) {
      continue;
    }

    cardIds.add(cardId);
  }

  return [...cardIds];
}

export function getTargetedFocusedPracticeHref(
  deckId: string,
  cardIds: readonly string[]
): string | null {
  if (cardIds.length === 0) return null;

  const encodedCardIds = cardIds.map((cardId) => encodeURIComponent(cardId)).join(",");
  return `/decks/${encodeURIComponent(deckId)}/quiz?mode=focused_practice&cardIds=${encodedCardIds}`;
}
