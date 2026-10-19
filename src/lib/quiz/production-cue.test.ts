import { describe, expect, it } from "vitest";
import {
  buildProductionCues,
  normalizeProductionCue,
  safelyBlankCanonicalTarget,
  type ProductionCueCandidate,
} from "./production-cue";

function card(overrides: Partial<ProductionCueCandidate> = {}): ProductionCueCandidate {
  return {
    id: "card",
    term: "resolve",
    meaningVi: "giải quyết",
    partOfSpeech: "verb",
    exampleEn: "The report should resolve the safety concerns.",
    ...overrides,
  };
}

describe("production Challenge cue contract", () => {
  it("uses only conservative exact Vietnamese-cue normalization", () => {
    expect(normalizeProductionCue('  “Giải   quyết!”  ')).toBe("giải quyết");
    expect(normalizeProductionCue("giải quyết tranh chấp")).not.toBe("giải quyết");
  });

  it("creates target-specific blanked context for a same-cue, same-POS collision", () => {
    const resolve = card();
    const address = card({
      id: "address",
      term: "address",
      exampleEn: "The report should address the safety concerns.",
    });

    const cues = buildProductionCues([resolve, address]);
    expect(cues.get(resolve.id)).toMatchObject({
      tier: "context_disambiguated",
      context: "The report should _____ the safety concerns.",
      collisionSiblingTargets: ["address"],
    });
    expect(cues.get(address.id)?.context).toBe("The report should _____ the safety concerns.");
  });

  it("does not leak an inflected suffix while blanking", () => {
    expect(safelyBlankCanonicalTarget("They resolved the dispute.", "resolve")).toEqual({
      blankedExample: "They resolved the dispute.",
      safe: false,
    });
    expect(safelyBlankCanonicalTarget("She attended the conference.", "attend")).toEqual({
      blankedExample: "She attended the conference.",
      safe: false,
    });
  });

  it("excludes same-cue same-POS cards when no complete canonical occurrence is safe", () => {
    const resolve = card({ exampleEn: "They resolved the dispute." });
    const address = card({ id: "address", term: "address", exampleEn: "They addressed the dispute." });
    const cues = buildProductionCues([resolve, address]);

    expect(cues.get(resolve.id)?.tier).toBe("excluded");
    expect(cues.get(address.id)?.tier).toBe("excluded");
  });

  it("uses a simple cue for a unique meaning and POS-only disambiguation for different POS", () => {
    const unique = card({ id: "unique", meaningVi: "tháo gỡ tranh chấp" });
    const noun = card({ id: "noun", term: "settlement", partOfSpeech: "noun" });
    const verb = card({ id: "verb", term: "settle", partOfSpeech: "verb" });
    const cues = buildProductionCues([unique, noun, verb]);

    expect(cues.get(unique.id)).toMatchObject({ tier: "simple", context: null, promptDetail: "Từ loại: verb" });
    expect(cues.get(noun.id)).toMatchObject({ tier: "pos_disambiguated", context: null });
    expect(cues.get(verb.id)).toMatchObject({ tier: "pos_disambiguated", context: null });
  });

  it("treats a missing legacy POS as unresolved unless its example can be safely blanked", () => {
    const legacy = card({ id: "legacy", partOfSpeech: null, exampleEn: "They resolved the dispute." });
    const known = card({ id: "known", term: "address", partOfSpeech: "verb", exampleEn: "They addressed the dispute." });

    expect(buildProductionCues([legacy, known]).get(legacy.id)?.tier).toBe("excluded");
  });
});
