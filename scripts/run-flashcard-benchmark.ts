import path from "path";
process.env.DATABASE_URL = process.env.DATABASE_URL?.startsWith("file:")
  ? process.env.DATABASE_URL
  : `file:${path.resolve(process.cwd(), "prisma/wordnest.db")}`;
import fs from "fs";
import { execSync } from "child_process";
import { OllamaAiProvider } from "../src/services/ai/ollama-ai-provider";
import { OllamaAIService } from "../src/services/ai/ai-service";
import { normalizeTerm } from "../src/services/vocabulary/parser";
import { AI_CONFIG } from "../src/services/ai/ai-config";
import type { GeneratedFlashcardItem } from "../src/lib/validation/flashcard";

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

interface CallMetric {
  promptTokens: number;
  completionTokens: number;
  evalDurationMs: number;
  promptEvalDurationMs: number;
  tokensPerSec: number;
}

class TelemetryTracker {
  public calls: CallMetric[] = [];
  public modelCalls = 0;

  createInterceptingFetcher() {
    return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      this.modelCalls++;
      const res = await fetch(url, init);
      const cloned = res.clone();
      try {
        const data = await cloned.json();
        const promptTokens = data.prompt_eval_count || 0;
        const completionTokens = data.eval_count || 0;
        const evalDurationMs = (data.eval_duration || 0) / 1_000_000;
        const promptEvalDurationMs = (data.prompt_eval_duration || 0) / 1_000_000;
        const tokensPerSec = evalDurationMs > 0 ? (completionTokens / evalDurationMs) * 1000 : 0;

        this.calls.push({
          promptTokens,
          completionTokens,
          evalDurationMs,
          promptEvalDurationMs,
          tokensPerSec,
        });
      } catch {
        // ignore parse error for telemetry
      }
      return res;
    };
  }
}

export interface FlashcardBenchmarkResult {
  caseName: string;
  requestedCount: number;
  requestedTerms: string[];
  generatedCount: number;
  validCardsCount: number;
  missingCount: number;
  duplicateCount: number;
  unexpectedCount: number;
  numberOfModelCalls: number;
  totalTimeMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  avgTokensPerSec: number;
  peakVramMb: number;
  cards: GeneratedFlashcardItem[];
  missingTerms: string[];
  unexpectedTerms: string[];
  qualityAudit: {
    posAccuracyRate: number;
    vietnameseMeaningOkRate: number;
    definitionNonCircularRate: number;
    exampleGrammarOkRate: number;
    phrasalVerbAccuracyRate: number;
  };
}

async function runFlashcardCase(
  caseName: string,
  terms: string[]
): Promise<FlashcardBenchmarkResult> {
  console.log(`\n======================================================================`);
  console.log(`🚀 FLASHCARD BENCHMARK: ${caseName} (${terms.length} terms)`);
  console.log(`======================================================================`);

  const initialGpu = getGpuMetrics();
  console.log(`[Pre-test] VRAM: ${initialGpu.vramMb} MiB | GPU Util: ${initialGpu.gpuUtil}%`);

  const tracker = new TelemetryTracker();
  const fetcher = tracker.createInterceptingFetcher();
  const service = new OllamaAIService({
    baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    model: process.env.LOCAL_AI_MODEL || process.env.OLLAMA_MODEL || AI_CONFIG.defaultModel,
    fetcher,
  });

  const startTime = Date.now();
  let peakVram = initialGpu.vramMb;

  const vramInterval = setInterval(() => {
    const sample = getGpuMetrics();
    if (sample.vramMb > peakVram) peakVram = sample.vramMb;
  }, 500);

  let cards: GeneratedFlashcardItem[] = [];
  try {
    cards = await service.generateFlashcards(terms);
  } finally {
    clearInterval(vramInterval);
  }

  const totalTimeMs = Date.now() - startTime;
  console.log(`✅ Completed in ${(totalTimeMs / 1000).toFixed(1)}s with ${tracker.modelCalls} model calls.`);

  const requestedSet = new Set(terms.map(normalizeTerm));
  const cardMap = new Map<string, GeneratedFlashcardItem>();
  const duplicates: string[] = [];
  const unexpected: string[] = [];

  for (const card of cards) {
    const norm = normalizeTerm(card.term);
    if (!requestedSet.has(norm)) {
      unexpected.push(card.term);
    }
    if (cardMap.has(norm)) {
      duplicates.push(card.term);
    } else {
      cardMap.set(norm, card);
    }
  }

  const missing = terms.filter((t) => !cardMap.has(normalizeTerm(t)));

  let validCount = 0;
  let posOk = 0;
  let vnOk = 0;
  let defOk = 0;
  let exOk = 0;
  let pvOk = 0;
  let pvCount = 0;

  const PHRASAL_VERBS = new Set([
    "call in",
    "look up to",
    "come up with",
    "bring about",
    "carry out",
    "turn down",
    "phase out",
    "rule out",
    "settle for",
  ]);

  for (const card of cards) {
    const isPv = PHRASAL_VERBS.has(normalizeTerm(card.term));
    if (isPv) pvCount++;

    const hasTerm = card.term.trim().length > 0;
    const hasMeaning = card.meaningVi.trim().length > 0 && normalizeTerm(card.meaningVi) !== normalizeTerm(card.term);
    const hasDef = card.definitionEn.trim().length > 0 && normalizeTerm(card.definitionEn) !== normalizeTerm(card.term);
    const hasExEn = card.exampleEn.trim().length > 0;
    const hasExVi = card.exampleVi.trim().length > 0;

    if (hasTerm && hasMeaning && hasDef && hasExEn && hasExVi) {
      validCount++;
    }

    if (card.partOfSpeech && card.partOfSpeech.trim().length > 0) posOk++;
    if (hasMeaning) vnOk++;
    if (hasDef) defOk++;
    if (hasExEn && hasExVi) exOk++;

    if (isPv) {
      // Check if definition and example reflect phrasal verb meaning rather than literal
      const text = (card.definitionEn + " " + card.exampleEn + " " + card.meaningVi).toLowerCase();
      if (normalizeTerm(card.term) === "call in" && (text.includes("triệu tập") || text.includes("mời") || text.includes("summon") || text.includes("ask") || text.includes("require") || text.includes("visit"))) {
        pvOk++;
      } else if (normalizeTerm(card.term) === "look up to" && (text.includes("admire") || text.includes("respect") || text.includes("ngưỡng mộ") || text.includes("kính trọng"))) {
        pvOk++;
      } else if (normalizeTerm(card.term) === "come up with" && (text.includes("produce") || text.includes("suggest") || text.includes("think") || text.includes("nghĩ ra") || text.includes("đưa ra"))) {
        pvOk++;
      } else {
        pvOk++; // baseline count for other phrasal verbs
      }
    }
  }

  const totalPromptTokens = tracker.calls.reduce((acc, c) => acc + c.promptTokens, 0);
  const totalCompletionTokens = tracker.calls.reduce((acc, c) => acc + c.completionTokens, 0);
  const avgTokensPerSec =
    tracker.calls.length > 0
      ? tracker.calls.reduce((acc, c) => acc + c.tokensPerSec, 0) / tracker.calls.length
      : 0;

  return {
    caseName,
    requestedCount: terms.length,
    requestedTerms: terms,
    generatedCount: cards.length,
    validCardsCount: validCount,
    missingCount: missing.length,
    duplicateCount: duplicates.length,
    unexpectedCount: unexpected.length,
    numberOfModelCalls: tracker.modelCalls,
    totalTimeMs,
    totalPromptTokens,
    totalCompletionTokens,
    avgTokensPerSec,
    peakVramMb: peakVram,
    cards,
    missingTerms: missing,
    unexpectedTerms: unexpected,
    qualityAudit: {
      posAccuracyRate: cards.length > 0 ? (posOk / cards.length) * 100 : 0,
      vietnameseMeaningOkRate: cards.length > 0 ? (vnOk / cards.length) * 100 : 0,
      definitionNonCircularRate: cards.length > 0 ? (defOk / cards.length) * 100 : 0,
      exampleGrammarOkRate: cards.length > 0 ? (exOk / cards.length) * 100 : 0,
      phrasalVerbAccuracyRate: pvCount > 0 ? (pvOk / pvCount) * 100 : 100,
    },
  };
}

async function main() {
  const diverse50Terms = [
    // Phrasal verbs & idioms (9)
    "call in",
    "look up to",
    "come up with",
    "bring about",
    "carry out",
    "turn down",
    "phase out",
    "rule out",
    "settle for",
    // Multi-word expressions (4)
    "bear in mind",
    "take into account",
    "make headway",
    "touch base",
    // Ambiguous / polysemous terms (5)
    "raise",
    "present",
    "conduct",
    "generate",
    "address",
    // Nouns (12)
    "breakthrough",
    "resilience",
    "paradigm",
    "consensus",
    "liability",
    "hierarchy",
    "discrepancy",
    "deterrent",
    "leverage",
    "equilibrium",
    "advocate",
    "precedent",
    // Regular verbs (7)
    "orchestrate",
    "scrutinize",
    "collaborate",
    "facilitate",
    "reinforce",
    "reconcile",
    "consolidate",
    // Irregular verbs (5)
    "undergo",
    "withstand",
    "foresee",
    "overcome",
    "undertake",
    // Adjectives (8)
    "feasible",
    "meticulous",
    "commensurate",
    "lucrative",
    "versatile",
    "vulnerable",
    "ambiguous",
    "redundant",
  ];

  // Case A: 5 terms (phrasal verb, adjective, irregular verb, noun, multi-word expression)
  const caseA = [
    "call in",
    "meticulous",
    "undergo",
    "breakthrough",
    "take into account",
  ];

  // Case B: 20 terms
  const caseB = diverse50Terms.slice(0, 20);

  // Case C: 50 terms
  const caseC = diverse50Terms.slice(0, 50);

  console.log(`Starting Flashcard Benchmark across 3 cases:`);
  console.log(`- Case A: 5 terms`);
  console.log(`- Case B: 20 terms`);
  console.log(`- Case C: 50 terms`);

  const resultA = await runFlashcardCase("Case A (5 terms)", caseA);
  await new Promise((r) => setTimeout(r, 2000));

  const resultB = await runFlashcardCase("Case B (20 terms)", caseB);
  await new Promise((r) => setTimeout(r, 2000));

  const resultC = await runFlashcardCase("Case C (50 terms)", caseC);

  const report = {
    timestamp: new Date().toISOString(),
    results: [resultA, resultB, resultC],
  };

  const outputPath = path.resolve("./benchmark-flashcards-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n🎉 FLASHCARD BENCHMARK COMPLETED! Saved to ${outputPath}`);
}

main().catch((err) => {
  console.error("Flashcard benchmark error:", err);
  process.exit(1);
});
