export type RandomSource = () => number;

export interface RandomLetterHintPattern {
  /** A display-only mask; it never contains an unrevealed answer character. */
  maskedAnswer: string;
  /** Character offsets in the source answer that are intentionally visible. */
  revealedCharacterIndexes: number[];
}

const LETTER_CHARACTER = /\p{L}/u;

function nextIndex(random: RandomSource, length: number): number {
  const value = random();
  const normalized = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999_999_999) : 0;
  return Math.floor(normalized * length);
}

/**
 * Keeps short answers useful without revealing them. Answers with three or
 * more letters always retain at least two masked letters; one-letter answers
 * remain fully masked and two-letter answers reveal just one character.
 */
export function getRandomLetterHintRevealCount(
  letterCount: number,
  random: RandomSource = Math.random
): number {
  if (letterCount <= 1) return 0;
  if (letterCount === 2) return 1;

  const minimum = Math.ceil(letterCount * 0.3);
  const maximum = Math.min(Math.floor(letterCount * 0.6), letterCount - 2);
  const lowerBound = Math.min(minimum, maximum);
  const upperBound = Math.max(minimum, maximum);

  return lowerBound + nextIndex(random, upperBound - lowerBound + 1);
}

/**
 * Creates an intentionally partial, randomized spelling cue. Letter choice is
 * randomized with Fisher-Yates; spacing, hyphens, apostrophes, and other
 * non-letter characters stay visible and never count toward the reveal rate.
 */
export function createRandomLetterHint(
  answer: string,
  random: RandomSource = Math.random
): RandomLetterHintPattern {
  const characters = Array.from(answer);
  const letterIndexes = characters.flatMap((character, index) =>
    LETTER_CHARACTER.test(character) ? [index] : []
  );
  const revealCount = getRandomLetterHintRevealCount(letterIndexes.length, random);
  const shuffledIndexes = [...letterIndexes];

  for (let index = shuffledIndexes.length - 1; index > 0; index -= 1) {
    const swapIndex = nextIndex(random, index + 1);
    [shuffledIndexes[index], shuffledIndexes[swapIndex]] = [
      shuffledIndexes[swapIndex]!,
      shuffledIndexes[index]!,
    ];
  }

  const revealedCharacterIndexes = shuffledIndexes.slice(0, revealCount).sort((a, b) => a - b);
  const revealed = new Set(revealedCharacterIndexes);

  return {
    maskedAnswer: characters
      .map((character, index) => {
        if (!LETTER_CHARACTER.test(character)) return character;
        return revealed.has(index) ? character : "_";
      })
      .join(" "),
    revealedCharacterIndexes,
  };
}
