import path from "path";
process.env.DATABASE_URL = process.env.DATABASE_URL?.startsWith("file:")
  ? process.env.DATABASE_URL
  : `file:${path.resolve(process.cwd(), "prisma/wordnest.db")}`;
import { execSync } from "child_process";
import { db } from "../src/lib/db";
import { OllamaAiProvider } from "../src/services/ai/ollama-ai-provider";
import { executeStoryPipeline } from "../src/services/ai/story-pipeline";
import { calculateDesiredPassageLength } from "../src/lib/story/story-options";
import { AI_CONFIG } from "../src/services/ai/ai-config";
import type { StoryCefr, StoryLength } from "../src/lib/validation/story";

interface GpuSample {
  vramMb: number;
  gpuUtil: number;
}

function getGpuMetrics(): GpuSample {
  try {
    const out = execSync(
      "nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader,nounits",
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const [vramStr, utilStr] = out.trim().split(",");
    return {
      vramMb: parseInt(vramStr?.trim(), 10) || 0,
      gpuUtil: parseInt(utilStr?.trim(), 10) || 0,
    };
  } catch {
    return { vramMb: 0, gpuUtil: 0 };
  }
}

function getOllamaPs(): string {
  try {
    return execSync("docker exec wordnest-local-ai-ollama-1 ollama ps", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (e) {
    return "Error getting ollama ps: " + String(e);
  }
}

interface CallMetric {
  type: string;
  stepName: string;
  promptTokens: number;
  completionTokens: number;
  evalDurationMs: number;
  promptEvalDurationMs: number;
  tokensPerSec: number;
  rawContent: string;
}

class BenchmarkTracker {
  public calls: CallMetric[] = [];
  private gpuSamples: GpuSample[] = [];
  private samplingInterval: NodeJS.Timeout | null = null;

  startGpuSampling() {
    this.gpuSamples = [];
    this.samplingInterval = setInterval(() => {
      this.gpuSamples.push(getGpuMetrics());
    }, 400);
  }

  stopGpuSampling() {
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
      this.samplingInterval = null;
    }
  }

  getGpuStats() {
    if (this.gpuSamples.length === 0) {
      const current = getGpuMetrics();
      return { peakVramMb: current.vramMb, peakUtil: current.gpuUtil, avgUtil: current.gpuUtil };
    }
    const peakVramMb = Math.max(...this.gpuSamples.map((s) => s.vramMb));
    const peakUtil = Math.max(...this.gpuSamples.map((s) => s.gpuUtil));
    const avgUtil = Math.round(
      this.gpuSamples.reduce((acc, s) => acc + s.gpuUtil, 0) / this.gpuSamples.length
    );
    return { peakVramMb, peakUtil, avgUtil };
  }

  createInterceptingFetcher() {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const res = await fetch(input, init);
      const cloned = res.clone();
      try {
        const data = (await cloned.json()) as {
          prompt_eval_count?: number;
          prompt_eval_duration?: number;
          eval_count?: number;
          eval_duration?: number;
          total_duration?: number;
          message?: { content?: unknown };
        };

        const promptTokens = data.prompt_eval_count || 0;
        const completionTokens = data.eval_count || 0;
        const evalDurationMs = data.eval_duration ? Math.round(data.eval_duration / 1e6) : 0;
        const promptEvalDurationMs = data.prompt_eval_duration
          ? Math.round(data.prompt_eval_duration / 1e6)
          : 0;
        const tokensPerSec =
          evalDurationMs > 0 ? Number(((completionTokens / evalDurationMs) * 1000).toFixed(2)) : 0;
        const rawContent =
          typeof data.message?.content === "string" ? data.message.content : "";

        // Infer step name based on call history
        let stepName = "initial_generation";
        if (this.calls.length > 0) {
          if (
            rawContent.includes('"translations"') ||
            rawContent.includes('"meaningVi"') ||
            rawContent.includes('"meaning"') ||
            rawContent.includes('"vietnamese"')
          ) {
            stepName = `translation_batch_${this.calls.filter((c) => c.stepName.startsWith("translation")).length + 1}`;
          } else {
            stepName = `repair_pass_${this.calls.filter((c) => c.stepName.startsWith("repair")).length + 1}`;
          }
        }

        this.calls.push({
          type: "ollama_chat",
          stepName,
          promptTokens,
          completionTokens,
          evalDurationMs,
          promptEvalDurationMs,
          tokensPerSec,
          rawContent,
        });
      } catch (err) {
        console.warn("[BenchmarkTracker] failed to parse response telemetry:", err);
      }
      return res;
    };
  }
}

interface BenchmarkCaseResult {
  caseName: string;
  targetCount: number;
  cefr: StoryCefr;
  length: StoryLength;
  desiredLength: number;
  terms: string[];
  preTest: {
    vramIdleMb: number;
    ollamaPs: string;
  };
  initialGeneration: {
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
    tokensPerSec: number;
    storyWordCount: number;
    matchedCount: number;
    coveragePercent: number;
    missingTerms: string[];
    rawFormat: string;
  };
  repairPasses: Array<{
    pass: number;
    missingBefore: string[];
    coverageBefore: number;
    coverageAfter: number;
    termsAdded: string[];
    termsLost: string[];
    durationMs: number;
    completionTokens: number;
  }>;
  final: {
    matchedCount: number;
    totalCount: number;
    coveragePercent: number;
    missingTerms: string[];
    repairPassesCount: number;
    storyWordCount: number;
    totalTimeMs: number;
    storyId: string;
    storyTitle: string;
    storyContent: string;
    mappings: Array<{ term: string; usedAs?: string; start?: number; end?: number }>;
  };
  hardware: {
    peakVramMb: number;
    peakGpuUtil: number;
    avgGpuUtil: number;
    processorResidency: string;
    isOom: boolean;
  };
  contextWindow: {
    largestPromptTokens: number;
    largestTotalTokens: number;
    headroomRemaining: number;
  };
  timings?: {
    initialGenerationMs: number;
    coverageValidationMs: number;
    repairPassesMs: number[];
    repairTotalMs: number;
    translationBatchMs: number[];
    translationRetryCount: number;
    translationTotalMs: number;
    persistenceMs: number;
    narrationMs: number;
    totalPipelineMs: number;
  };
  quality?: {
    repetition: {
      repeatedTerms: Array<{ term: string; count: number }>;
      repeatedFrames: {
        theAbilityTo: number;
        theImportanceOf: number;
        aKeyFactor: number;
        thisIsWhy: number;
      };
      paragraphOpeners: Record<string, number>;
    };
    collisions: Array<{
      span: { start: number; end: number; text: string };
      competingTerms: string[];
      winnerTerm: string;
    }>;
  };
}

async function runTestCase({
  caseName,
  deckId,
  terms,
  cefr,
  length,
  topic = "Personnel and Career Development",
}: {
  caseName: string;
  deckId: string;
  terms: string[];
  cefr: StoryCefr;
  length: StoryLength;
  topic?: string;
}): Promise<BenchmarkCaseResult> {
  console.log(`\n======================================================================`);
  console.log(`🚀 STARTING BENCHMARK: ${caseName}`);
  console.log(`Terms: ${terms.length} | CEFR: ${cefr} | Length: ${length}`);
  console.log(`======================================================================`);

  // 1. Record pre-test hardware status
  const preGpu = getGpuMetrics();
  const preOllamaPs = getOllamaPs();
  console.log(`[Pre-test] Idle VRAM: ${preGpu.vramMb} MiB | GPU Util: ${preGpu.gpuUtil}%`);
  console.log(`[Pre-test] Ollama PS:\n${preOllamaPs || "(none)"}`);

  const desiredLength = calculateDesiredPassageLength(length, terms.length);
  console.log(`[Input] Desired passage length: ${desiredLength} words`);

  // 2. Set up telemetry tracker
  const tracker = new BenchmarkTracker();
  const fetcher = tracker.createInterceptingFetcher();
  const ollamaProvider = new OllamaAiProvider({
    baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    model: process.env.LOCAL_AI_MODEL || process.env.OLLAMA_MODEL || AI_CONFIG.defaultModel,
    fetcher,
  });

  tracker.startGpuSampling();
  const startTime = Date.now();

  // 3. Execute Story Pipeline
  let pipelineResult;
  try {
    pipelineResult = await executeStoryPipeline({
      deckId,
      targetWords: terms,
      cefr,
      length,
      topic,
      ollamaProvider,
      onStageChange: async (stage, progress) => {
        console.log(`  [Pipeline Stage] ${stage} (${progress}%)`);
      },
    });
  } finally {
    tracker.stopGpuSampling();
  }

  const totalTimeMs = Date.now() - startTime;
  const gpuStats = tracker.getGpuStats();
  const postOllamaPs = getOllamaPs();

  console.log(`\n✅ PIPELINE COMPLETED in ${(totalTimeMs / 1000).toFixed(1)}s`);
  console.log(`[Hardware] Peak VRAM: ${gpuStats.peakVramMb} MiB | Peak Util: ${gpuStats.peakUtil}% | Avg Util: ${gpuStats.avgUtil}%`);
  console.log(`[Post-test] Ollama PS:\n${postOllamaPs}`);

  // 4. Analyze calls and coverage history
  const genCall = tracker.calls.find((c) => c.stepName === "initial_generation");
  const repairCalls = tracker.calls.filter((c) => c.stepName.startsWith("repair_pass"));

  const initialCoverageSnapshot = pipelineResult.coverageHistory[0];
  const finalCoverageSnapshot = pipelineResult.coverageHistory[pipelineResult.coverageHistory.length - 1];

  // Raw format check
  let rawFormat = "JSON";
  if (genCall?.rawContent.trim().startsWith("TITLE:")) {
    rawFormat = "TITLE/PASSAGE";
  } else if (genCall?.rawContent.trim().startsWith("#")) {
    rawFormat = "Markdown";
  } else if (genCall?.rawContent.includes("```json")) {
    rawFormat = "JSON_CODEBLOCK";
  }

  // Parse initial story word count
  let initialStoryWordCount = 0;
  try {
    const parsedInit = JSON.parse(genCall?.rawContent || "{}");
    initialStoryWordCount = (parsedInit.content || "").split(/\s+/).filter(Boolean).length;
  } catch {
    initialStoryWordCount = 0;
  }

  // Analyze repair passes
  const repairPasses: BenchmarkCaseResult["repairPasses"] = [];
  for (let i = 1; i < pipelineResult.coverageHistory.length; i++) {
    const prev = pipelineResult.coverageHistory[i - 1];
    const curr = pipelineResult.coverageHistory[i];
    const call = repairCalls[i - 1];

    const prevMatched = new Set(terms.filter((t) => !prev.missingTerms.includes(t)));
    const currMatched = new Set(terms.filter((t) => !curr.missingTerms.includes(t)));

    const termsAdded = Array.from(currMatched).filter((t) => !prevMatched.has(t));
    const termsLost = Array.from(prevMatched).filter((t) => !currMatched.has(t));


    repairPasses.push({
      pass: i,
      missingBefore: prev.missingTerms,
      coverageBefore: prev.coveragePercent,
      coverageAfter: curr.coveragePercent,
      termsAdded,
      termsLost,
      durationMs: call?.evalDurationMs || 0,
      completionTokens: call?.completionTokens || 0,
    });
  }

  // Final story word count
  const finalWordCount = pipelineResult.story.content.split(/\s+/).filter(Boolean).length;

  // Context window calculations
  const largestPromptTokens = Math.max(...tracker.calls.map((c) => c.promptTokens), 0);
  const largestTotalTokens = Math.max(
    ...tracker.calls.map((c) => c.promptTokens + c.completionTokens),
    0
  );
  const headroomRemaining = AI_CONFIG.defaultContextSize - largestTotalTokens;

  console.log(`\n⏱️ [STAGE TIMINGS]`);
  console.log(`  - Initial Generation: ${(pipelineResult.timings.initialGenerationMs / 1000).toFixed(1)}s`);
  console.log(`  - Coverage Validation: ${pipelineResult.timings.coverageValidationMs}ms`);
  console.log(`  - Repair Passes (${pipelineResult.timings.repairPassesMs.length}): ${(pipelineResult.timings.repairTotalMs / 1000).toFixed(1)}s [${pipelineResult.timings.repairPassesMs.map((ms: number) => (ms / 1000).toFixed(1) + "s").join(", ")}]`);
  console.log(`  - Translations (${pipelineResult.timings.translationBatchMs.length} batches, ${pipelineResult.timings.translationRetryCount} retries): ${(pipelineResult.timings.translationTotalMs / 1000).toFixed(1)}s [${pipelineResult.timings.translationBatchMs.map((ms: number) => (ms / 1000).toFixed(1) + "s").join(", ")}]`);
  console.log(`  - DB Persistence: ${pipelineResult.timings.persistenceMs}ms`);
  console.log(`  - Narration: ${pipelineResult.timings.narrationMs}ms`);
  console.log(`  - Total Pipeline: ${(pipelineResult.timings.totalPipelineMs / 1000).toFixed(1)}s`);

  console.log(`\n🔍 [QUALITY DIAGNOSTICS]`);
  console.log(`  - Robotic Frames: 'the ability to'=${pipelineResult.quality.repetition.repeatedFrames.theAbilityTo}, 'the importance of'=${pipelineResult.quality.repetition.repeatedFrames.theImportanceOf}, 'a key factor'=${pipelineResult.quality.repetition.repeatedFrames.aKeyFactor}, 'this is why'=${pipelineResult.quality.repetition.repeatedFrames.thisIsWhy}`);
  console.log(`  - Span Collisions Detected: ${pipelineResult.quality.collisions.length}`);
  if (pipelineResult.quality.collisions.length > 0) {
    for (const col of pipelineResult.quality.collisions) {
      console.log(`    Collision on "${col.span.text}": competitors=[${col.competingTerms.join(", ")}] -> winner="${col.winnerTerm}"`);
    }
  }

  return {
    caseName,
    targetCount: terms.length,
    cefr,
    length,
    desiredLength,
    terms,
    preTest: {
      vramIdleMb: preGpu.vramMb,
      ollamaPs: preOllamaPs,
    },
    initialGeneration: {
      promptTokens: genCall?.promptTokens || 0,
      completionTokens: genCall?.completionTokens || 0,
      durationMs: genCall?.evalDurationMs || 0,
      tokensPerSec: genCall?.tokensPerSec || 0,
      storyWordCount: initialStoryWordCount,
      matchedCount: initialCoverageSnapshot?.matchedTerms || 0,
      coveragePercent: initialCoverageSnapshot?.coveragePercent || 0,
      missingTerms: initialCoverageSnapshot?.missingTerms || [],
      rawFormat,
    },
    repairPasses,
    final: {
      matchedCount: finalCoverageSnapshot?.matchedTerms || 0,
      totalCount: terms.length,
      coveragePercent: pipelineResult.coveragePercent,
      missingTerms: pipelineResult.missingTerms,
      repairPassesCount: pipelineResult.repairPasses,
      storyWordCount: finalWordCount,
      totalTimeMs,
      storyId: pipelineResult.story.id,
      storyTitle: pipelineResult.story.title,
      storyContent: pipelineResult.story.content,
      mappings: pipelineResult.usage,
    },
    hardware: {
      peakVramMb: gpuStats.peakVramMb,
      peakGpuUtil: gpuStats.peakUtil,
      avgGpuUtil: gpuStats.avgUtil,
      processorResidency: postOllamaPs,
      isOom: false,
    },
    contextWindow: {
      largestPromptTokens,
      largestTotalTokens,
      headroomRemaining,
    },
    timings: pipelineResult.timings,
    quality: pipelineResult.quality,
  };
}

async function main() {
  const deck = await db.deck.findFirst({
    where: { name: { contains: "Personnel" } },
    include: { cards: { orderBy: { createdAt: "asc" } } },
  });

  if (!deck || deck.cards.length < 62) {
    throw new Error(`Personnel deck not found or has fewer than 62 cards (found: ${deck?.cards.length || 0})`);
  }

  const allTerms = deck.cards.map((c) => c.term);

  // CASE A: 8 terms, CEFR B1, Medium
  const caseATerms = [
    "apply",
    "candidate",
    "qualifications",
    "submit",
    "confidence",
    "call in",
    "be ready for",
    "success",
  ];

  // CASE B: 30 terms, CEFR B2, Long
  const caseBTerms = allTerms.slice(0, 30);

  // CASE C: 62 terms, CEFR C1, Long
  const caseCTerms = allTerms.slice(0, 62);

  console.log("Deck selected: " + deck.name + " (" + deck.id + ")");
  console.log("Case A terms (8):", caseATerms);
  console.log("Case B terms (30):", caseBTerms);
  console.log("Case C terms (62):", caseCTerms);

  // Run sequentially
  const resultA = await runTestCase({
    caseName: "CASE A (8 terms, B1, Medium)",
    deckId: deck.id,
    terms: caseATerms,
    cefr: "B1",
    length: "medium",
  });

  // Short pause between cases
  await new Promise((r) => setTimeout(r, 2000));

  const resultB = await runTestCase({
    caseName: "CASE B (30 terms, B2, Long)",
    deckId: deck.id,
    terms: caseBTerms,
    cefr: "B2",
    length: "long",
  });

  await new Promise((r) => setTimeout(r, 2000));

  const resultC = await runTestCase({
    caseName: "CASE C (62 terms, C1, Long)",
    deckId: deck.id,
    terms: caseCTerms,
    cefr: "C1",
    length: "long",
  });

  const fullReport = {
    timestamp: new Date().toISOString(),
    deckName: deck.name,
    deckId: deck.id,
    results: [resultA, resultB, resultC],
  };

  // Write results to JSON artifact for complete audit
  const fs = await import("fs");
  const path = await import("path");
  const reportPath = path.resolve("./benchmark-final-results.json");
  fs.writeFileSync(reportPath, JSON.stringify(fullReport, null, 2), "utf-8");
  console.log(`\n🎉 BENCHMARK RUN COMPLETED! Saved full report to ${reportPath}`);
}

main()
  .catch((err) => {
    console.error("Benchmark failed with error:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
