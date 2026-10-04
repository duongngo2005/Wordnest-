import { execSync } from "child_process";

type BenchmarkResult = {
  context: number;
  promptTokens: number;
  promptSpeed: number;
  evalTokens: number;
  evalSpeed: number;
  totalTime: number;
  vramUsedMb: number;
  processor: string;
};

function getVramUsage(): number {
  try {
    const out = execSync("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits", { encoding: "utf-8" });
    return parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function getProcessorResidency(): string {
  try {
    const out = execSync("docker exec wordnest-local-ai-ollama-1 ollama ps", { encoding: "utf-8" });
    const lines = out.trim().split("\n");
    if (lines.length > 1) {
      return lines[1].replace(/\s+/g, " ");
    }
  } catch {}
  return "Unknown";
}

async function runBenchmark(contextSize: number): Promise<BenchmarkResult | null> {
  console.log(`\n======================================================`);
  console.log(`BENCHMARKING qwen3:8b WITH NUM_CTX = ${contextSize}`);
  console.log(`======================================================`);

  const prompt = `You are a talented author writing an engaging story for English learners.
Target words: ["characteristic", "consequence", "evaluate", "strategy", "access", "initiative", "provider", "reduction"]
Requirements: CEFR B2, Medium length (~200 words). Use every target naturally; inflect verbs when grammar requires it. Return clean plain text with no Markdown formatting.
Respond with JSON only: {"title": "Title", "content": "Story content..."}`;

  const startMs = Date.now();
  const res = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3:8b",
      messages: [
        { role: "system", content: "You are a master author. Respond with JSON only." },
        { role: "user", content: prompt }
      ],
      format: "json",
      think: false,
      stream: false,
      options: {
        temperature: 0.7,
        num_ctx: contextSize
      }
    })
  });

  if (!res.ok) {
    console.error(`HTTP error: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const totalTime = (Date.now() - startMs) / 1000;

  const promptEvalTokens = data.prompt_eval_count || 0;
  const promptEvalMs = (data.prompt_eval_duration || 0) / 1_000_000;
  const promptSpeed = promptEvalMs > 0 ? promptEvalTokens / (promptEvalMs / 1000) : 0;

  const evalTokens = data.eval_count || 0;
  const evalMs = (data.eval_duration || 0) / 1_000_000;
  const evalSpeed = evalMs > 0 ? evalTokens / (evalMs / 1000) : 0;

  const vramUsedMb = getVramUsage();
  const processor = getProcessorResidency();

  console.log(`Results for num_ctx = ${contextSize}:`);
  console.log(`- Prompt Eval Speed: ${promptSpeed.toFixed(2)} tok/s (${promptEvalTokens} tokens)`);
  console.log(`- Generation Speed: ${evalSpeed.toFixed(2)} tok/s (${evalTokens} tokens)`);
  console.log(`- Total Wall Time: ${totalTime.toFixed(2)}s`);
  console.log(`- VRAM Used: ${vramUsedMb} MB / 6144 MB`);
  console.log(`- Processor Residency: ${processor}`);

  return {
    context: contextSize,
    promptTokens: promptEvalTokens,
    promptSpeed,
    evalTokens,
    evalSpeed,
    totalTime,
    vramUsedMb,
    processor
  };
}

async function main() {
  const contexts = [4096, 6144, 8192];
  const results: BenchmarkResult[] = [];

  for (const ctx of contexts) {
    const res = await runBenchmark(ctx);
    if (res) results.push(res);
  }

  console.log(`\n======================================================`);
  console.log(`SUMMARY BENCHMARK REPORT (RTX 4050 6GB)`);
  console.log(`======================================================`);
  console.table(results);
}

main().catch(console.error);
