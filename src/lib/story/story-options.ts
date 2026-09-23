import type { StoryLength } from "@/lib/validation/story";

type StoryLengthProfile = {
  label: string;
  coverage: { min: number; max: number };
  getWordRange: (selectedTermCount: number) => { minWords: number; maxWords: number };
};

function roundDownToTen(value: number): number {
  return Math.floor(value / 10) * 10;
}

export type StoryGenerationGuidance = {
  label: string;
  minWords: number;
  maxWords: number;
  vocabularyTarget: { min: number; max: number };
  description: string;
};

export const STORY_LENGTH_OPTIONS: Record<StoryLength, StoryLengthProfile> = {
  short: {
    label: "Ngắn (Short)",
    coverage: { min: 0.4, max: 0.5 },
    getWordRange: (count) => ({
      minWords: Math.max(100, roundDownToTen(90 + count * 5)),
      maxWords: Math.max(150, roundDownToTen(130 + count * 7)),
    }),
  },
  medium: {
    label: "Vừa (Medium)",
    coverage: { min: 0.6, max: 0.75 },
    getWordRange: (count) => ({
      minWords: Math.max(200, roundDownToTen(170 + count * 10)),
      maxWords: Math.max(300, roundDownToTen(220 + count * 12)),
    }),
  },
  long: {
    label: "Dài (Long)",
    coverage: { min: 0.8, max: 0.9 },
    getWordRange: (count) => ({
      minWords: Math.max(350, roundDownToTen(250 + count * 13)),
      maxWords: Math.max(500, roundDownToTen(330 + count * 16)),
    }),
  },
};

function normalizeSelectedTermCount(selectedTermCount: number): number {
  return Math.max(0, Math.floor(selectedTermCount));
}

function getVocabularyTarget(
  selectedTermCount: number,
  coverage: StoryLengthProfile["coverage"]
): { min: number; max: number } {
  return {
    min: Math.min(selectedTermCount, Math.ceil(selectedTermCount * coverage.min)),
    max: Math.min(selectedTermCount, Math.ceil(selectedTermCount * coverage.max)),
  };
}

export function getStoryGenerationGuidance(
  length: StoryLength,
  selectedTermCount: number
): StoryGenerationGuidance {
  const count = normalizeSelectedTermCount(selectedTermCount);
  const profile = STORY_LENGTH_OPTIONS[length];
  const { minWords, maxWords } = profile.getWordRange(count);
  const vocabularyTarget = getVocabularyTarget(count, profile.coverage);
  const range = `${minWords}–${maxWords}`;
  const target = `${vocabularyTarget.min}–${vocabularyTarget.max}`;

  return {
    label: profile.label,
    minWords,
    maxWords,
    vocabularyTarget,
    description: count === 0 ? `~${range} từ` : `~${range} từ · mục tiêu ${target}/${count} từ`,
  };
}

export function getStoryLengthRange(length: StoryLength, selectedTermCount: number): string {
  const { minWords, maxWords } = getStoryGenerationGuidance(length, selectedTermCount);
  return `${minWords}–${maxWords}`;
}
