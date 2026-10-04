async function runBenchmark(title: string, count: number, cefr: string, length: string) {
  console.log(`\n======================================================`);
  console.log(`STARTING BENCHMARK: ${title} (${count} terms, ${cefr}, ${length})`);
  console.log(`======================================================`);

  const sampleWords = [
    "characteristic", "consequence", "consider", "cover", "expire",
    "frequently", "imply", "promise", "protect", "reputation",
    "require", "variety", "address", "avoid", "demonstrate",
    "develop", "evaluate", "gather", "offer", "primarily",
    "risk", "strategy", "strong", "substitute", "accommodate",
    "arrangement", "association", "attend", "get in touch", "hold",
    "location", "overcrowded", "register", "select", "session",
    "take part in", "access", "allocate", "compatible", "delete",
    "display", "duplicate", "failure", "figure out", "ignore",
    "search", "shut down", "warning", "affordable", "as needed",
    "be in charge of", "capacity", "durable", "initiative", "physically",
    "provider", "recur", "reduction", "stay on top of", "stock",
    "appreciation", "be made of"
  ];

  const targetWords = sampleWords.slice(0, count);

  const startMs = Date.now();
  const prompt = `You are a talented author and English language teacher writing an engaging, memorable story for English learners.

Target Vocabulary to naturally incorporate into the story:
${JSON.stringify(targetWords)}

Requirements:
1. Topic: Daily Life
2. Language level: CEFR ${cefr}.
3. Reading length: ${length}.
4. Use every target word naturally. You may inflect words or phrasal verbs when grammar requires it; do not force base forms into ungrammatical sentences. Return clean plain text with no Markdown formatting.
5. Provide a catchy, appealing title for the story.

Respond with JSON only:
{
  "title": "Story Title Here",
  "content": "Story content..."
}`;

  const res = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3:8b",
      messages: [
        { role: "system", content: "You are a master English author. Respond with JSON only." },
        { role: "user", content: prompt }
      ],
      format: "json",
      think: false,
      stream: false,
      options: {
        temperature: 0.7,
        num_ctx: 8192
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`ERROR: HTTP ${res.status}: ${errText}`);
    return;
  }

  const data = await res.json();
  const elapsedSec = (Date.now() - startMs) / 1000;

  const promptEvalTokens = data.prompt_eval_count || 0;
  const promptEvalMs = (data.prompt_eval_duration || 0) / 1_000_000;
  const evalTokens = data.eval_count || 0;
  const evalMs = (data.eval_duration || 0) / 1_000_000;
  const totalMs = (data.total_duration || 0) / 1_000_000;
  const tokensPerSec = evalMs > 0 ? (evalTokens / (evalMs / 1000)).toFixed(2) : "0";

  console.log(`Benchmark Result for: ${title}`);
  console.log(`- Elapsed Wall Time: ${elapsedSec.toFixed(2)}s`);
  console.log(`- Prompt Eval Count: ${promptEvalTokens} tokens in ${(promptEvalMs / 1000).toFixed(2)}s`);
  console.log(`- Output Eval Count: ${evalTokens} tokens in ${(evalMs / 1000).toFixed(2)}s`);
  console.log(`- Tokens per second: ${tokensPerSec} tok/s`);
  console.log(`- Total Duration: ${(totalMs / 1000).toFixed(2)}s`);

  let parsed: { title?: string; content?: string } | null = null;
  try {
    parsed = JSON.parse(data.message?.content || "{}");
    if (parsed) {
      console.log(`- Story Title: "${parsed.title || "N/A"}"`);
      console.log(`- Content Length: ${parsed.content?.length || 0} characters (~${Math.round((parsed.content?.length || 0) / 5)} words)`);
      console.log(`- JSON Schema Valid: ${Boolean(parsed.title && parsed.content)}`);
    }
  } catch (err) {
    console.log(`- JSON Parse Error:`, err);
  }
}

async function main() {
  // Test 3: 15 vocabulary B2 Medium
  await runBenchmark("Test 3: 15 vocab B2 Medium", 15, "B2", "medium");

  // Test 4: 30 vocabulary B2 Long
  await runBenchmark("Test 4: 30 vocab B2 Long", 30, "B2", "long");

  // Test 5: 62 vocabulary C1 Long
  await runBenchmark("Test 5: 62 vocab C1 Long", 62, "C1", "long");
}

main().catch(console.error);
