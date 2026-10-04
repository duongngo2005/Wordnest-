import { describe, expect, it, vi } from "vitest";
import {
  executeStoryPipeline,
  findWordInContent,
  analyzeVocabularyCoverage,
  normalizeRawTranslationBatch,
  getRepairWordBudget,
  extractSurroundingSentence,
  analyzeRepetition,
} from "./story-pipeline";
import { OllamaAiProvider } from "./ollama-ai-provider";
import { storyService } from "@/services/vocabulary/story-service";
import * as narrationTtsRuntime from "@/lib/tts/tts-runtime";

describe("story-pipeline helpers", () => {
  it("detects exact word matches in story content", () => {
    const content = "She felt a sense of serendipity when they met.";
    expect(findWordInContent(content, "serendipity")).toBe("serendipity");
  });

  it("detects inflected English words (-ed, -ing, -s)", () => {
    const content = "He was allocating resources efficiently yesterday.";
    expect(findWordInContent(content, "allocate")).toBe("allocating");

    const content2 = "The doctor examined three patients.";
    expect(findWordInContent(content2, "patient")).toBe("patients");
  });

  it("recognizes grammatical verb forms without accepting unrelated derivations", () => {
    expect(findWordInContent("She applied for the position yesterday.", "apply")).toBe("applied");
    expect(findWordInContent("Her expertise impressed the panel.", "expert")).toBeNull();
    expect(findWordInContent("They discussed her retirement plan.", "retire")).toBeNull();
  });

  it("recognizes inflected phrasal verbs while preserving their lexical structure", () => {
    expect(findWordInContent("She looked up to her mentor.", "look up to")).toBe("looked up to");
    expect(findWordInContent("The project brought together several teams.", "bring together")).toBe("brought together");
    expect(findWordInContent("They came up with a clear plan.", "come up with")).toBe("came up with");
  });

  it("normalizes punctuation and whitespace but never matches inside a longer word", () => {
    expect(findWordInContent("\u201cApplied\u201d, she said.", "apply")).toBe("Applied");
    expect(findWordInContent("She will reapply next year.", "apply")).toBeNull();
    expect(findWordInContent("They followed   up after the interview.", "follow up")).toBe("followed up");
  });

  it("returns null when a word is not present", () => {
    const content = "The sun rose over the quiet town.";
    expect(findWordInContent(content, "avalanche")).toBeNull();
  });

  it("calculates vocabulary coverage correctly", () => {
    const content = "He walked into the serendipity cafe and greeted every patient warmly.";
    const requested = ["serendipity", "patient", "catastrophic"];

    const result = analyzeVocabularyCoverage(content, requested);
    expect(result.used).toHaveLength(2);
    expect(result.missing).toEqual(["catastrophic"]);
    expect(result.coveragePercent).toBeCloseTo((2 / 3) * 100);
  });

  it("repairs only when deterministic coverage finds a missing term and stops at 100%", async () => {
    const responses = [
      { title: "A New Role", content: "Clara applied for the position." },
      { title: "A New Role", content: "Clara applied for the position because she looked up to her mentor." },
      {
        translations: [
          { term: "apply", usedAs: "applied", meaningVi: "ứng tuyển" },
          { term: "look up to", usedAs: "looked up to", meaningVi: "ngưỡng mộ" },
        ],
      },
    ];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify(responses.shift()) },
    }), { status: 200 }));
    const ollamaProvider = new OllamaAiProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "wordnest-test",
      fetcher,
    });
    const vocabularySpy = vi.spyOn(storyService, "getSelectedDeckVocabulary").mockResolvedValue([
      { term: "apply", partOfSpeech: "verb" },
      { term: "look up to", partOfSpeech: "phrasal verb" },
    ]);
    const persistSpy = vi.spyOn(storyService, "persistGeneratedStory").mockResolvedValue({ id: "story-1" } as never);

    try {
      const result = await executeStoryPipeline({
        deckId: "deck-1",
        targetWords: ["apply", "look up to"],
        ollamaProvider,
      });

      expect(result.coveragePercent).toBe(100);
      expect(result.missingTerms).toEqual([]);
      expect(result.repairPasses).toBe(1);
      expect(result.coverageHistory).toEqual([
        expect.objectContaining({ pass: 0, matchedTerms: 1, totalTerms: 2 }),
        expect.objectContaining({ pass: 1, matchedTerms: 2, totalTerms: 2 }),
      ]);
      expect(result.usage).toEqual([
        expect.objectContaining({ term: "apply", usedAs: "applied" }),
        expect.objectContaining({ term: "look up to", usedAs: "looked up to" }),
      ]);
      expect(result.timings).toBeDefined();
      expect(result.timings.totalPipelineMs).toBeGreaterThanOrEqual(0);
      expect(result.timings.initialGenerationMs).toBeGreaterThanOrEqual(0);
      expect(result.quality).toBeDefined();
      expect(result.quality.repetition).toBeDefined();
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(persistSpy).toHaveBeenCalledWith(expect.objectContaining({
        generated: expect.objectContaining({ content: expect.stringContaining("looked up to") }),
      }));
    } finally {
      vocabularySpy.mockRestore();
      persistSpy.mockRestore();
    }
  });

  it("does not invoke a repair when the initial story already covers every term", async () => {
    const responses = [
      { title: "A New Role", content: "Clara applied for the position and looked up to her mentor." },
      {
        translations: [
          { term: "apply", usedAs: "applied", meaningVi: "ứng tuyển" },
          { term: "look up to", usedAs: "looked up to", meaningVi: "ngưỡng mộ" },
        ],
      },
    ];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify(responses.shift()) },
    }), { status: 200 }));
    const vocabularySpy = vi.spyOn(storyService, "getSelectedDeckVocabulary").mockResolvedValue([
      { term: "apply", partOfSpeech: "verb" },
      { term: "look up to", partOfSpeech: "phrasal verb" },
    ]);
    const persistSpy = vi.spyOn(storyService, "persistGeneratedStory").mockResolvedValue({ id: "story-1" } as never);

    try {
      await executeStoryPipeline({
        deckId: "deck-1",
        targetWords: ["apply", "look up to"],
        ollamaProvider: new OllamaAiProvider({
          baseUrl: "http://127.0.0.1:11434",
          model: "wordnest-test",
          fetcher,
        }),
      });

      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vocabularySpy.mockRestore();
      persistSpy.mockRestore();
    }
  });

  it("materializes the selected cloud narration from final English before persistence", async () => {
    const responses = [
      { title: "A New Role", content: "Clara applied for the position." },
      { translations: [{ term: "apply", usedAs: "applied", meaningVi: "ứng tuyển" }] },
    ];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify(responses.shift()) },
    }), { status: 200 }));
    const vocabularySpy = vi.spyOn(storyService, "getSelectedDeckVocabulary").mockResolvedValue([
      { term: "apply", partOfSpeech: "verb" },
    ]);
    const persistSpy = vi.spyOn(storyService, "persistGeneratedStory").mockResolvedValue({ id: "story-1" } as never);
    const synthesizeNarration = vi.fn().mockResolvedValue(undefined);
    const ttsSpy = vi.spyOn(narrationTtsRuntime, "getNarrationTtsService").mockReturnValue({
      synthesizeNarration,
      removeNarration: vi.fn(),
    });

    try {
      const stages: string[] = [];
      await executeStoryPipeline({
        deckId: "deck-1",
        targetWords: ["apply"],
        narrationVoiceId: "wordnest:ava",
        onStageChange: async (stage) => { stages.push(stage); },
        ollamaProvider: new OllamaAiProvider({
          baseUrl: "http://127.0.0.1:11434",
          model: "wordnest-test",
          fetcher,
        }),
      });

      expect(synthesizeNarration).toHaveBeenCalledWith(expect.objectContaining({
        voiceId: "wordnest:ava",
        chunks: ["Clara applied for the position."],
      }));
      expect(stages).toContain("generating_narration");
      expect(persistSpy).toHaveBeenCalledWith(expect.objectContaining({ narrationVoiceId: "wordnest:ava" }));
    } finally {
      vocabularySpy.mockRestore();
      persistSpy.mockRestore();
      ttsSpy.mockRestore();
    }
  });
});

describe("normalizeRawTranslationBatch", () => {
  const requested = [
    { term: "recruit", usedAs: "recruiting" },
    { term: "look up to", usedAs: "looked up to" },
  ];

  it("normalizes standard translations array", () => {
    const raw = {
      translations: [
        { term: "recruit", usedAs: "recruiting", meaningVi: "tuyển dụng" },
        { term: "look up to", usedAs: "looked up to", meaningVi: "ngưỡng mộ" },
      ],
    };
    const res = normalizeRawTranslationBatch(raw, requested);
    expect(res).toEqual([
      { term: "recruit", usedAs: "recruiting", meaningVi: "tuyển dụng" },
      { term: "look up to", usedAs: "looked up to", meaningVi: "ngưỡng mộ" },
    ]);
  });

  it("normalizes alternative key names (word/vietnamese, english/meaning)", () => {
    const raw = {
      translations: [
        { word: "recruit", vietnamese: "tuyển mộ" },
        { english: "look up to", meaning: "kính trọng" },
      ],
    };
    const res = normalizeRawTranslationBatch(raw, requested);
    expect(res).toEqual([
      { term: "recruit", usedAs: "recruiting", meaningVi: "tuyển mộ" },
      { term: "look up to", usedAs: "looked up to", meaningVi: "kính trọng" },
    ]);
  });

  it("normalizes dictionary/object map format", () => {
    const raw = {
      recruit: "tuyển dụng",
      "look up to": "ngưỡng mộ",
    };
    const res = normalizeRawTranslationBatch(raw, requested);
    expect(res).toEqual([
      { term: "recruit", usedAs: "recruiting", meaningVi: "tuyển dụng" },
      { term: "look up to", usedAs: "looked up to", meaningVi: "ngưỡng mộ" },
    ]);
  });

  it("uses controlled index fallback when count matches and meanings are present", () => {
    const raw = [
      { unknownKey: "val1", meaningVi: "tuyển dụng nhân sự" },
      { unknownKey: "val2", meaningVi: "tôn trọng ai đó" },
    ];
    const res = normalizeRawTranslationBatch(raw, requested);
    expect(res).toEqual([
      { term: "recruit", usedAs: "recruiting", meaningVi: "tuyển dụng nhân sự" },
      { term: "look up to", usedAs: "looked up to", meaningVi: "tôn trọng ai đó" },
    ]);
  });

  it("rejects ambiguous or count-mismatched output without guessing", () => {
    const raw = [
      { unknownKey: "val1", meaningVi: "tuyển dụng" },
    ];
    const res = normalizeRawTranslationBatch(raw, requested);
    expect(res).toBeNull();
  });
});

describe("getRepairWordBudget", () => {
  it("scales word budget smoothly with missing count", () => {
    expect(getRepairWordBudget(1).max).toBe(120);
    expect(getRepairWordBudget(3).max).toBe(120);
    expect(getRepairWordBudget(5).max).toBe(200);
    expect(getRepairWordBudget(12).max).toBe(320);
    expect(getRepairWordBudget(20).max).toBe(420);
  });

  it("caps word budget when remaining global story budget is restricted", () => {
    // Missing 10 terms normally gets max 320 words, but with remaining budget of 90, it gets capped
    const budget = getRepairWordBudget(10, 90);
    expect(budget.max).toBe(90);
    expect(budget.min).toBeLessThanOrEqual(90);
    expect(budget.label).toContain("strictly bounded by remaining story budget");

    // When remaining budget is zero or negative, return minimal wrap-up budget
    const minimal = getRepairWordBudget(5, 0);
    expect(minimal.max).toBe(80);
    expect(minimal.label).toContain("strictly minimal conclusion");
  });
});

describe("extractSurroundingSentence", () => {
  it("extracts exact sentence by span coordinates", () => {
    const text = "Lucas loved hiking in the mountains. Lena was called in for a meeting yesterday. She prepared thoroughly.";
    const sentence = extractSurroundingSentence(text, 51, 60, "called in");
    expect(sentence).toBe("Lena was called in for a meeting yesterday.");
  });

  it("falls back to keyword search when spans are missing", () => {
    const text = "He had abundant talent. She was thrilled.";
    const sentence = extractSurroundingSentence(text, undefined, undefined, "abundant");
    expect(sentence).toBe("He had abundant talent.");
  });
});

describe("analyzeRepetition", () => {
  it("detects repeated terms and robotic frames", () => {
    const text = `
      She had the ability to run. In addition, the ability to think.
      The importance of practice was clear. The importance of focus was vital.
      This is why she succeeded.
    `;
    const res = analyzeRepetition(text, ["run", "think"]);
    expect(res.repeatedFrames.theAbilityTo).toBe(2);
    expect(res.repeatedFrames.theImportanceOf).toBe(2);
    expect(res.repeatedFrames.thisIsWhy).toBe(1);
  });
});
