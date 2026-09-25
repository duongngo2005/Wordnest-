import type { StoryCefr, StoryLength, StoryTopic } from "@/lib/validation/story";
import { getStoryGenerationGuidance } from "./story-options";

export type StoryPromptOptions = {
  targetWords: string[];
  cefr: StoryCefr;
  length: StoryLength;
  topic: StoryTopic;
};

/**
 * Produces the portable contract used by WordNest and by an external AI. Keeping
 * this in one place prevents the direct-AI and copy-prompt paths from drifting.
 */
export function buildStoryPrompt({ targetWords, cefr, length, topic }: StoryPromptOptions): string {
  const guidance = getStoryGenerationGuidance(length, targetWords.length);
  const wordCountGuide = `${guidance.minWords}\u2013${guidance.maxWords} words`;

  return `You are a talented author and English language teacher writing an engaging, memorable story for English learners.

Target Vocabulary to include naturally in the story:
${JSON.stringify(targetWords)}

Requirements:
1. Topic: ${topic}
2. Language level: CEFR ${cefr}. The sentence structure, vocabulary, and grammar should naturally align with ${cefr}.
3. Reading length: ${length}. For this selection, write approximately ${wordCountGuide}. This range is calculated from the selected vocabulary; do not use a fixed length for every story.
4. Use approximately ${guidance.vocabularyTarget.min}\u2013${guidance.vocabularyTarget.max} of the ${targetWords.length} target words naturally. If fewer fit the narrative, omit them rather than forcing an awkward list.
5. Provide a catchy, appealing title for the story.
6. For every target vocabulary item actually used, report its canonical supplied term and the exact surface form copied from content in "usage". If a term is absent, omit it. Do not infer a surface form.
7. "contextualTranslations" is optional enrichment. For any used vocabulary you are confident about, return its natural Vietnamese meaning in the story context. Omit uncertain entries. Do not include sentences.

Return ONLY one valid JSON object. Do not add Markdown, explanations, or code fences. It must match this schema:
{
  "title": "Story Title Here",
  "content": "Paragraph 1\\n\\nParagraph 2\\n\\nParagraph 3",
  "usage": [
    { "term": "allocate", "usedAs": "allocated" }
  ],
  "contextualTranslations": [
    { "term": "allocate", "usedAs": "allocated", "meaningVi": "phân bổ" }
  ]
}`;
}
