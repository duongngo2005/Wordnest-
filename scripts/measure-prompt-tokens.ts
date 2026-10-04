import path from "path";
process.env.DATABASE_URL = process.env.DATABASE_URL?.startsWith("file:")
  ? process.env.DATABASE_URL
  : `file:${path.resolve(process.cwd(), "prisma/wordnest.db")}`;
import { db } from "../src/lib/db";
import {
  buildStoryPromptForStructuredJson,
  buildLocalCompactStoryPromptForStructuredJson,
} from "../src/lib/story/story-prompt";
import type { StoryCefr, StoryLength } from "../src/lib/validation/story";

async function measureTokensWithOllama(prompt: string): Promise<number> {
  const res = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3:8b",
      prompt,
      stream: false,
      options: { num_predict: 1 },
    }),
  });
  const data = (await res.json()) as { prompt_eval_count?: number };
  return data.prompt_eval_count || 0;
}

async function main() {
  const deck = await db.deck.findFirst({
    where: { name: { contains: "Personnel" } },
    include: {
      cards: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!deck) {
    console.error("Deck Personnel not found!");
    process.exit(1);
  }

  const allTerms = deck.cards.map((c) => c.term);

  const cases: Array<{
    name: string;
    count: number;
    cefr: StoryCefr;
    length: StoryLength;
  }> = [
    { name: "CASE A (8 terms)", count: 8, cefr: "B1", length: "medium" },
    { name: "CASE B (30 terms)", count: 30, cefr: "B2", length: "long" },
    { name: "CASE C (62 terms)", count: 62, cefr: "C1", length: "long" },
  ];

  console.log("==================================================");
  console.log("PROMPT TOKEN MEASUREMENT (Full vs Compact)");
  console.log("==================================================");

  for (const c of cases) {
    const terms = allTerms.slice(0, c.count);
    const fullPrompt = buildStoryPromptForStructuredJson({
      targetWords: terms,
      cefr: c.cefr,
      length: c.length,
      topic: "Workplace & Professional Development",
    });

    const compactPrompt = buildLocalCompactStoryPromptForStructuredJson({
      targetWords: terms,
      cefr: c.cefr,
      length: c.length,
      topic: "Workplace & Professional Development",
    });

    const fullTokens = await measureTokensWithOllama(fullPrompt);
    const compactTokens = await measureTokensWithOllama(compactPrompt);
    const savedTokens = fullTokens - compactTokens;
    const reductionPercent = ((savedTokens / fullTokens) * 100).toFixed(1);

    console.log(`\n${c.name}:`);
    console.log(`  Full Prompt Tokens:    ${fullTokens}`);
    console.log(`  Compact Prompt Tokens: ${compactTokens}`);
    console.log(`  Tokens Saved:          ${savedTokens} (${reductionPercent}% reduction)`);
    console.log(`  Headroom with 4096:    ${4096 - compactTokens} tokens`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
