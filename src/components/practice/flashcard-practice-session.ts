export type FlashcardPracticeDirection = "en_vi" | "vi_en";

export type FlashcardPracticeMode = FlashcardPracticeDirection | "mix";

/**
 * Lexical fields intentionally safe to send to the client Practice session.
 * Scheduler and learning-evidence fields are deliberately absent.
 */
export interface PracticeFlashcardData {
  id: string;
  term: string;
  meaningVi: string;
  definitionEn?: string | null;
  ipa?: string | null;
  partOfSpeech?: string | null;
  cefr?: string | null;
  exampleEn?: string | null;
  exampleVi?: string | null;
  imageUrl?: string | null;
  imageAuthor?: string | null;
  imageSource?: string | null;
}

export interface PracticeCardSessionItem {
  card: PracticeFlashcardData;
  direction: FlashcardPracticeDirection;
}

type RandomSource = () => number;

function shuffleItems<T>(items: readonly T[], random: RandomSource): T[] {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const currentItem = shuffledItems[index];
    shuffledItems[index] = shuffledItems[swapIndex]!;
    shuffledItems[swapIndex] = currentItem!;
  }

  return shuffledItems;
}

/**
 * Creates one frozen first-pass session. Mix randomization only runs from a
 * start-session event, never during React rendering.
 */
export function createFlashcardPracticeSession(
  cards: readonly PracticeFlashcardData[],
  mode: FlashcardPracticeMode,
  random: RandomSource = Math.random
): PracticeCardSessionItem[] {
  if (mode === "en_vi" || mode === "vi_en") {
    return cards.map((card) => ({ card, direction: mode }));
  }

  const shuffledCards = shuffleItems(cards, random);
  const enViCount = Math.ceil(shuffledCards.length / 2);
  const assignedDirections = shuffledCards.map((card, index) => ({
    card,
    direction: index < enViCount ? "en_vi" : "vi_en",
  } satisfies PracticeCardSessionItem));

  return shuffleItems(assignedDirections, random);
}
