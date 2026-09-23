const DEFAULT_NARRATION_CHUNK_LENGTH = 240;

function splitLongSentenceByWords(sentence: string, maxChunkLength: number): string[] {
  const chunks: string[] = [];
  let chunk = "";

  for (const word of sentence.split(/\s+/).filter(Boolean)) {
    const nextChunk = chunk ? `${chunk} ${word}` : word;
    if (chunk && nextChunk.length > maxChunkLength) {
      chunks.push(chunk);
      chunk = word;
      continue;
    }
    chunk = nextChunk;
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

export function splitStoryIntoNarrationChunks(
  content: string,
  maxChunkLength = DEFAULT_NARRATION_CHUNK_LENGTH
): string[] {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) return [];

  const sentences = normalizedContent.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [normalizedContent];
  const chunks: string[] = [];
  let chunk = "";

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length > maxChunkLength) {
      if (chunk) {
        chunks.push(chunk);
        chunk = "";
      }
      chunks.push(...splitLongSentenceByWords(sentence, maxChunkLength));
      continue;
    }

    const nextChunk = chunk ? `${chunk} ${sentence}` : sentence;
    if (chunk && nextChunk.length > maxChunkLength) {
      chunks.push(chunk);
      chunk = sentence;
      continue;
    }
    chunk = nextChunk;
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}
