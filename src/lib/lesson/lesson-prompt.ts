import type { StoryCefr } from "@/lib/validation/story";

export type LessonPromptOptions = {
  targetWords: Array<{
    term: string;
    meaningVi?: string | null;
    partOfSpeech?: string | null;
  }>;
  cefr: StoryCefr;
  topic?: string;
};

/**
 * Builds an educational passage prompt specifically designed for WordNest AI Lessons.
 * Unlike fictional stories, the passage focuses on realistic everyday, workplace, or
 * informational contexts where target words appear naturally with rich contextual clues.
 */
export function buildLessonPrompt({
  targetWords,
  cefr,
  topic = "Everyday Situations & Communication",
}: LessonPromptOptions): string {
  const wordsList = targetWords
    .map((w) => `- "${w.term}" (${w.partOfSpeech || "word"})${w.meaningVi ? `: ${w.meaningVi}` : ""}`)
    .join("\n");

  const termsOnly = targetWords.map((w) => `"${w.term}"`).join(", ");

  return `You are an expert English language educator and curriculum designer creating an educational reading lesson for WordNest.

Task:
Write a concise, natural, and coherent educational reading passage (~120 to 200 words) centered on the theme "${topic}".

Target Vocabulary to naturally integrate:
${wordsList}

Strict Pedagogical Guidelines:
1. Every target word (${termsOnly}) MUST appear naturally in the passage.
2. Contextual Clues: Embed each target word in a sentence that provides clear context, allowing the learner to infer its meaning from surrounding clues.
3. Natural Flow: Do NOT write a disjointed list of sample sentences or artificially force dictionary definitions into the text. The passage must read like an authentic article, real-world workplace scenario, or informative short essay.
4. Language Complexity: Keep sentence structures, grammar, and non-target vocabulary strictly appropriate for CEFR Level ${cefr}.
5. Title: Provide an engaging, informative title (under 8 words).

Response Format:
Respond with ONLY valid JSON adhering to this exact schema:
{
  "title": "Passage Title Here",
  "content": "Full passage text here (~120-200 words). Paragraphs separated by two newlines."
}`;
}
