export type TypedAnswerHintStyle = "partial" | "blank";

export interface TypedAnswerHints {
  partial: string;
  blank: string;
}

const PARTIAL_HINT_REVEAL_PATTERN = [false, true, false, true, true, false, false] as const;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

function createPartialHint(answer: string): string {
  let characterIndexInWord = 0;

  return Array.from(answer)
    .map((character) => {
      if (!WORD_CHARACTER.test(character)) {
        characterIndexInWord = 0;
        return character;
      }

      const shouldReveal = PARTIAL_HINT_REVEAL_PATTERN[
        characterIndexInWord % PARTIAL_HINT_REVEAL_PATTERN.length
      ];
      characterIndexInWord += 1;
      return shouldReveal ? character : "_";
    })
    .join("");
}

function createBlankHint(answer: string): string {
  return Array.from(answer)
    .map((character) => (WORD_CHARACTER.test(character) ? "_" : character))
    .join("");
}

/**
 * Produces safe spelling cues for typed-recall questions without exposing the
 * complete expected answer to the client.
 */
export function createTypedAnswerHints(answer: string): TypedAnswerHints {
  return {
    partial: createPartialHint(answer),
    blank: createBlankHint(answer),
  };
}
