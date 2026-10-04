import { execSync } from "child_process";
import { getStoryGenerationGuidance } from "../src/lib/story/story-options";
import { analyzeVocabularyCoverage } from "../src/services/ai/story-pipeline";
import { db } from "../src/lib/db";

interface RunMetrics {
  contextSize: number;
  caseName: string;
  wordCountTarget: number;
  cefr: string;
  length: "medium" | "long";
  promptEvalCount: number;
  promptEvalDurationMs: number;
  promptTokensPerSec: number;
  evalCount: number;
  evalDurationMs: number;
  evalTokensPerSec: number;
  totalDurationSec: number;
  peakVramMb: number;
  peakGpuUtilPercent: number;
  hostRamUsedMb: number;
  processorResidency: string;
  isOom: boolean;
  jsonSuccess: boolean;
  title: string;
  storyWordCount: number;
  coveragePercent: number;
  usedWordsCount: number;
}

type OllamaBenchmarkResponse = {
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  message?: { content?: unknown };
};

function isStoryContent(value: unknown): value is { title?: string; content?: string } {
  return typeof value === "object" && value !== null;
}

function getGpuMetrics(): { vramMb: number; gpuUtil: number } {
  try {
    const out = execSync("nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader,nounits", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parts = out.trim().split(",");
    return {
      vramMb: parseInt(parts[0]?.trim(), 10) || 0,
      gpuUtil: parseInt(parts[1]?.trim(), 10) || 0,
    };
  } catch {
    return { vramMb: 0, gpuUtil: 0 };
  }
}

function getHostRamUsedMb(): number {
  try {
    const out = execSync("free -m | grep 'Mem:'", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    const parts = out.trim().split(/\s+/);
    return parseInt(parts[2], 10) || 0;
  } catch {
    return 0;
  }
}

function getProcessorResidency(): string {
  try {
    const out = execSync("docker exec wordnest-local-ai-ollama-1 ollama ps", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const lines = out.trim().split("\n");
    if (lines.length > 1) {
      // Columns: NAME ID SIZE PROCESSOR CONTEXT UNTIL
      const row = lines[1].trim().split(/\s{2,}/);
      return row[3] || lines[1].replace(/\s+/g, " ");
    }
  } catch {}
  return "Unknown";
}

async function runSingleBenchmark({
  contextSize,
  caseName,
  terms,
  cefr,
  length,
  topic = "Business and Workplace",
}: {
  contextSize: number;
  caseName: string;
  terms: string[];
  cefr: "B1" | "B2" | "C1";
  length: "medium" | "long";
  topic?: string;
}): Promise<RunMetrics> {
  console.log(`\n------------------------------------------------------------`);
  console.log(`[BENCHMARK] ctx=${contextSize} | ${caseName} (${terms.length} words, ${cefr}, ${length})`);
  console.log(`------------------------------------------------------------`);

  const guidance = getStoryGenerationGuidance(length, terms.length);
  const wordCountGuide = `${guidance.minWords}\u2013${guidance.maxWords} words`;

  const storyPrompt = `You are a talented author and English language teacher writing an engaging, memorable story for English learners.

Required Vocabulary to use naturally in the story:
${JSON.stringify(terms)}

Requirements:
1. Topic: ${topic}
2. Language level: CEFR ${cefr}. The sentence structure, vocabulary, and grammar should naturally align with ${cefr}.
3. Reading length: ${length}. For this selection, write approximately ${wordCountGuide}.
4. Use every required vocabulary item naturally. Vocabulary is supplied in dictionary/base form: you may inflect a word or verb when grammar requires it. Never force a base form into an ungrammatical sentence.
5. Correct grammar, collocation, semantic meaning, and narrative coherence are mandatory. Do not use a vocabulary list, glossary, or isolated filler sentence.
6. Return clean plain text in title and content. Do NOT use Markdown formatting: no **bold**, *italic*, underscores, backticks, headings, or bullet markers.
7. Provide a catchy, appealing title for the story.

Respond with JSON only matching this schema:
{
  "title": "Story Title Here",
  "content": "Paragraph 1\\n\\nParagraph 2\\n\\nParagraph 3"
}`;

  let peakVram = 0;
  let peakGpuUtil = 0;
  let pollActive = true;

  const pollInterval = setInterval(() => {
    if (!pollActive) return;
    const { vramMb, gpuUtil } = getGpuMetrics();
    if (vramMb > peakVram) peakVram = vramMb;
    if (gpuUtil > peakGpuUtil) peakGpuUtil = gpuUtil;
  }, 400);

  const startMs = Date.now();
  let responseData: OllamaBenchmarkResponse | null = null;
  let isOom = false;
  let fetchError: Error | null = null;

  try {
    const res = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3:8b",
        messages: [
          {
            role: "system",
            content: "You are a master English author and language teacher. You must output valid JSON only.",
          },
          { role: "user", content: storyPrompt },
        ],
        format: "json",
        think: false,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_ctx: contextSize,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (/out of memory|cuda/i.test(errText)) {
        isOom = true;
      }
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    responseData = await res.json() as OllamaBenchmarkResponse;
  } catch (error: unknown) {
    fetchError = error instanceof Error ? error : new Error(String(error));
    console.error("Error during inference:", fetchError.message);
  } finally {
    pollActive = false;
    clearInterval(pollInterval);
  }

  const totalDurationSec = (Date.now() - startMs) / 1000;
  const hostRamUsedMb = getHostRamUsedMb();
  const processorResidency = getProcessorResidency();

  if (fetchError || !responseData) {
    return {
      contextSize,
      caseName,
      wordCountTarget: terms.length,
      cefr,
      length,
      promptEvalCount: 0,
      promptEvalDurationMs: 0,
      promptTokensPerSec: 0,
      evalCount: 0,
      evalDurationMs: 0,
      evalTokensPerSec: 0,
      totalDurationSec,
      peakVramMb: peakVram,
      peakGpuUtilPercent: peakGpuUtil,
      hostRamUsedMb,
      processorResidency,
      isOom,
      jsonSuccess: false,
      title: "ERROR",
      storyWordCount: 0,
      coveragePercent: 0,
      usedWordsCount: 0,
    };
  }

  const promptEvalCount = responseData.prompt_eval_count || 0;
  const promptEvalDurationMs = (responseData.prompt_eval_duration || 0) / 1_000_000;
  const promptTokensPerSec =
    promptEvalDurationMs > 0 ? (promptEvalCount / (promptEvalDurationMs / 1000)) : 0;

  const evalCount = responseData.eval_count || 0;
  const evalDurationMs = (responseData.eval_duration || 0) / 1_000_000;
  const evalTokensPerSec =
    evalDurationMs > 0 ? (evalCount / (evalDurationMs / 1000)) : 0;

  let jsonSuccess = false;
  let parsedContent: { title?: string; content?: string } = {};
  try {
    const raw = typeof responseData.message?.content === "string" ? responseData.message.content : "";
    const parsed = JSON.parse(raw) as unknown;
    if (isStoryContent(parsed)) parsedContent = parsed;
    if (typeof parsedContent.title === "string" && typeof parsedContent.content === "string") {
      jsonSuccess = true;
    }
  } catch {
    jsonSuccess = false;
  }

  const storyContent = parsedContent.content || "";
  const storyWordCount = storyContent.trim() ? storyContent.trim().split(/\s+/).length : 0;
  const coverage = analyzeVocabularyCoverage(storyContent, terms);

  console.log(`- Prompt Eval: ${promptEvalCount} tokens in ${(promptEvalDurationMs / 1000).toFixed(2)}s (${promptTokensPerSec.toFixed(1)} tok/s)`);
  console.log(`- Generation: ${evalCount} tokens in ${(evalDurationMs / 1000).toFixed(2)}s (${evalTokensPerSec.toFixed(1)} tok/s)`);
  console.log(`- Wall Time: ${totalDurationSec.toFixed(2)}s`);
  console.log(`- VRAM Peak: ${peakVram} MB / 6141 MB (${((peakVram / 6141) * 100).toFixed(1)}%) | GPU Util: ${peakGpuUtil}%`);
  console.log(`- Host RAM: ${hostRamUsedMb} MB | Processor: ${processorResidency}`);
  console.log(`- JSON Success: ${jsonSuccess} | Title: "${parsedContent.title || 'N/A'}"`);
  console.log(`- Story Words: ${storyWordCount} words (Expected: ${wordCountGuide})`);
  console.log(`- Vocab Coverage: ${coverage.used.length}/${terms.length} (${coverage.coveragePercent.toFixed(1)}%)`);

  return {
    contextSize,
    caseName,
    wordCountTarget: terms.length,
    cefr,
    length,
    promptEvalCount,
    promptEvalDurationMs,
    promptTokensPerSec,
    evalCount,
    evalDurationMs,
    evalTokensPerSec,
    totalDurationSec,
    peakVramMb: peakVram,
    peakGpuUtilPercent: peakGpuUtil,
    hostRamUsedMb,
    processorResidency,
    isOom,
    jsonSuccess,
    title: parsedContent.title || "N/A",
    storyWordCount,
    coveragePercent: coverage.coveragePercent,
    usedWordsCount: coverage.used.length,
  };
}

async function main() {
  console.log("================================================================================");
  console.log(" WORDNEST LOCAL AI BENCHMARK: QWEN3:8B ACROSS CONTEXT SIZES (RTX 4050 6GB)");
  console.log("================================================================================");

  // Fetch words from deck
  const deck = await db.deck.findFirst({
    where: { name: { contains: "General Bussiness" } },
    include: { cards: { select: { term: true }, orderBy: { term: "asc" } } },
  });

  if (!deck || deck.cards.length < 62) {
    throw new Error("Could not find deck with 62 words for testing");
  }

  const all62Terms = deck.cards.map((c) => c.term);
  const termsCaseA = all62Terms.slice(0, 8);
  const termsCaseB = all62Terms.slice(0, 30);
  const termsCaseC = all62Terms;

  console.log(`Loaded ${all62Terms.length} terms from deck '${deck.name}'.`);
  console.log(`Case A: ${termsCaseA.length} terms (B1 Medium)`);
  console.log(`Case B: ${termsCaseB.length} terms (B2 Long)`);
  console.log(`Case C: ${termsCaseC.length} terms (C1 Long)`);

  const contexts = [4096];
  const allResults: RunMetrics[] = [];

  for (const ctx of contexts) {
    console.log(`\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
    console.log(`>>> TESTING NUM_CTX = ${ctx}`);
    console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);

    // Case A: 8 words, B1 Medium
    const resA = await runSingleBenchmark({
      contextSize: ctx,
      caseName: "Case A (8 words)",
      terms: termsCaseA,
      cefr: "B1",
      length: "medium",
    });
    allResults.push(resA);

    // Sleep 2s between runs for GPU cooldown
    await new Promise((r) => setTimeout(r, 2000));

    // Case B: 30 words, B2 Long
    const resB = await runSingleBenchmark({
      contextSize: ctx,
      caseName: "Case B (30 words)",
      terms: termsCaseB,
      cefr: "B2",
      length: "long",
    });
    allResults.push(resB);

    await new Promise((r) => setTimeout(r, 2000));

    // Case C: 62 words, C1 Long
    const resC = await runSingleBenchmark({
      contextSize: ctx,
      caseName: "Case C (62 words)",
      terms: termsCaseC,
      cefr: "C1",
      length: "long",
    });
    allResults.push(resC);

    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(`\n\n================================================================================`);
  console.log(` FINAL BENCHMARK SUMMARY TABLE`);
  console.log(`================================================================================`);
  console.table(
    allResults.map((r) => ({
      Context: r.contextSize,
      Case: r.caseName,
      "Prompt Tok": r.promptEvalCount,
      "P-Tok/s": r.promptTokensPerSec.toFixed(1),
      "Eval Tok": r.evalCount,
      "Gen Tok/s": r.evalTokensPerSec.toFixed(1),
      "Wall (s)": r.totalDurationSec.toFixed(1),
      "VRAM Peak": `${r.peakVramMb} MB`,
      "GPU Res": r.processorResidency,
      "GPU %": `${r.peakGpuUtilPercent}%`,
      "Words": r.storyWordCount,
      "Coverage": `${r.usedWordsCount}/${r.wordCountTarget} (${r.coveragePercent.toFixed(0)}%)`,
      "JSON": r.jsonSuccess ? "PASS" : "FAIL",
      "OOM": r.isOom ? "OOM" : "NO",
    }))
  );

  // Print context-level averages
  console.log(`\n================================================================================`);
  console.log(` CONTEXT-LEVEL COMPARISON`);
  console.log(`================================================================================`);
  for (const ctx of contexts) {
    const ctxRuns = allResults.filter((r) => r.contextSize === ctx);
    const avgGenSpeed = ctxRuns.reduce((sum, r) => sum + r.evalTokensPerSec, 0) / ctxRuns.length;
    const maxVram = Math.max(...ctxRuns.map((r) => r.peakVramMb));
    const caseC = ctxRuns.find((r) => r.caseName === "Case C (62 words)")!;
    console.log(`\n--- NUM_CTX = ${ctx} ---`);
    console.log(`Average Gen Speed: ${avgGenSpeed.toFixed(1)} tok/s`);
    console.log(`Peak VRAM observed: ${maxVram} MB`);
    console.log(`Case C (62 words): ${caseC.totalDurationSec.toFixed(1)}s, ${caseC.evalTokensPerSec.toFixed(1)} tok/s, ${caseC.storyWordCount} words, Coverage ${caseC.coveragePercent.toFixed(1)}%`);
    console.log(`Processor Residency: ${caseC.processorResidency}`);
  }
}

main().catch(console.error);
