import { aiStoryResponseSchema } from "@/lib/validation/story";
import { cleanAndParseJson } from "@/services/ai/ai-core";

/**
 * Legacy story records may contain the vocabulary emphasis markers that an older
 * generation prompt explicitly requested. New prompts forbid Markdown; this is a
 * narrow compatibility cleanup for paired strong markers only.
 */
export function normalizeStoryPlainText(content: string): string {
  return content
    .replace(/\\\*\\\*([^*\n]+?)\\\*\\\*/g, "$1")
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1");
}

export type ParsedStoryResponse = {
  title: string;
  content: string;
  wordsUsed?: string[];
  usage?: Array<{ term: string; usedAs: string }>;
  contextualTranslations?: unknown[];
};

/**
 * Robust parser for AI story outputs.
 * Supports:
 * 1. WordNest Reading Engine standard text format:
 *    TITLE:
 *    <title>
 *    PASSAGE:
 *    <passage>
 * 2. Markdown headings:
 *    # <title>
 *    <passage>
 * 3. JSON object:
 *    { "title": "...", "content": "..." }
 *    (including wrapped in markdown ```json ... ``` codeblocks)
 * 4. Two-part plain text fallback (first line title, empty line, passage).
 */
export function parseStoryResponseText(rawText: string): ParsedStoryResponse {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Nội dung trống. Vui lòng dán kết quả do AI tạo.");
  }

  // 1. Try JSON parsing first (either raw JSON or within ```json codeblock)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidateJson = (codeBlockMatch ? codeBlockMatch[1] : trimmed).trim();

  if (candidateJson.startsWith("{") && candidateJson.endsWith("}")) {
    try {
      const parsed = cleanAndParseJson<unknown>(candidateJson);
      const validated = aiStoryResponseSchema.safeParse(parsed);
      if (validated.success) {
        return {
          title: normalizeStoryPlainText(validated.data.title),
          content: normalizeStoryPlainText(validated.data.content),
          wordsUsed: validated.data.wordsUsed,
          usage: validated.data.usage,
          contextualTranslations: validated.data.contextualTranslations,
        };
      }
    } catch {
      // Continue to textual pattern matching
    }
  }

  // 2. Pattern: TITLE: <title>\n\nPASSAGE: <passage> (same-line title)
  const singleLineTitleMatch = trimmed.match(
    /(?:^|\n)\s*(?:TITLE|Title)\s*:\s*([^\n]+)[\s\S]*?(?:(?:^|\n)\s*(?:PASSAGE|Passage|CONTENT|Content|STORY|Story)\s*:\s*([\s\S]+))$/i
  );
  if (singleLineTitleMatch) {
    const title = singleLineTitleMatch[1].trim();
    const content = singleLineTitleMatch[2].trim();
    if (title && content) {
      return {
        title: normalizeStoryPlainText(title),
        content: normalizeStoryPlainText(content),
      };
    }
  }

  // 3. Pattern: TITLE:\n<title>\n\nPASSAGE:\n<passage> (multiline title)
  const multiLineTitleMatch = trimmed.match(
    /(?:^|\n)\s*(?:TITLE|Title)\s*:\s*\n+([^\n]+)[\s\S]*?(?:(?:^|\n)\s*(?:PASSAGE|Passage|CONTENT|Content|STORY|Story)\s*:\s*\n*([\s\S]+))$/i
  );
  if (multiLineTitleMatch) {
    const title = multiLineTitleMatch[1].trim();
    const content = multiLineTitleMatch[2].trim();
    if (title && content) {
      return {
        title: normalizeStoryPlainText(title),
        content: normalizeStoryPlainText(content),
      };
    }
  }

  // 4. Pattern: Markdown Heading `# <Title>\n\n<Content>`
  const markdownHeadingMatch = trimmed.match(/^#\s*([^\n]+)\n+([\s\S]+)$/);
  if (markdownHeadingMatch) {
    const title = markdownHeadingMatch[1].trim();
    const content = markdownHeadingMatch[2].trim();
    if (title && content) {
      return {
        title: normalizeStoryPlainText(title),
        content: normalizeStoryPlainText(content),
      };
    }
  }

  // 5. Fallback: First line title (<= 100 chars), followed by empty line and paragraphs
  const lines = trimmed.split(/\r?\n/);
  if (
    lines.length >= 3 &&
    lines[0].trim().length > 0 &&
    lines[0].trim().length <= 100 &&
    lines[1].trim() === ""
  ) {
    const title = lines[0].trim().replace(/^["']|["']$/g, "");
    const content = lines.slice(2).join("\n").trim();
    if (title && content.length >= 10) {
      return {
        title: normalizeStoryPlainText(title),
        content: normalizeStoryPlainText(content),
      };
    }
  }

  throw new Error(
    "Không thể nhận diện tiêu đề và nội dung truyện. Hãy đảm bảo nội dung có 'TITLE:' và 'PASSAGE:' hoặc cấu trúc JSON hợp lệ."
  );
}
