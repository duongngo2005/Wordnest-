export interface ProductionCueCandidate {
  id: string;
  term: string;
  meaningVi: string;
  partOfSpeech: string | null;
  exampleEn: string | null;
}

export type ProductionCueTier = "simple" | "pos_disambiguated" | "context_disambiguated" | "excluded";

export interface ProductionCue {
  tier: ProductionCueTier;
  normalizedCue: string;
  prompt: string;
  promptDetail: string;
  context: string | null;
  collisionSiblingTargets: string[];
}

const OUTER_CUE_PUNCTUATION = /^[\s"'“”‘’()[\]{}.,!?…:;]+|[\s"'“”‘’()[\]{}.,!?…:;]+$/g;

export function normalizeProductionCue(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(OUTER_CUE_PUNCTUATION, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePartOfSpeech(value: string | null): string {
  return value?.normalize("NFC").trim().toLocaleLowerCase() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces only exact, complete canonical target occurrences. It intentionally
 * does not attempt inflection, stemming, or substring replacement, so
 * `attend` cannot turn `attended` into `___ed`.
 */
export function safelyBlankCanonicalTarget(
  exampleEn: string | null | undefined,
  canonicalTerm: string
): { blankedExample: string; safe: boolean } {
  const sentence = exampleEn?.normalize("NFC") ?? "";
  const target = canonicalTerm.normalize("NFC").trim();
  if (!sentence || !target || /[\r\n/()]/.test(target)) {
    return { blankedExample: sentence, safe: false };
  }

  const escapedTarget = escapeRegExp(target).replace(/\s+/g, "\\s+");
  // Unicode letter/number guards prevent a canonical word from masking part of
  // an inflected or compound surface form while still handling punctuation and
  // multi-word targets safely.
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapedTarget}(?![\\p{L}\\p{N}])`, "giu");
  if (!pattern.test(sentence)) return { blankedExample: sentence, safe: false };

  return {
    blankedExample: sentence.replace(pattern, "_____"),
    safe: true,
  };
}

function buildCollisionGroups(cards: readonly ProductionCueCandidate[]): Map<string, ProductionCueCandidate[]> {
  const groups = new Map<string, ProductionCueCandidate[]>();
  for (const card of cards) {
    const normalizedCue = normalizeProductionCue(card.meaningVi);
    if (!normalizedCue) continue;
    const group = groups.get(normalizedCue) ?? [];
    group.push(card);
    groups.set(normalizedCue, group);
  }
  return groups;
}

function promptDetailFor(card: ProductionCueCandidate): string {
  return `Từ loại: ${card.partOfSpeech?.trim() || "chưa xác định"}`;
}

/**
 * Computes conservative presentation metadata from exact same-deck Vietnamese
 * cues. No semantic similarity, dictionary, or model call is used here.
 */
export function buildProductionCues(
  cards: readonly ProductionCueCandidate[]
): Map<string, ProductionCue> {
  const groups = buildCollisionGroups(cards);
  const cues = new Map<string, ProductionCue>();

  for (const card of cards) {
    const normalizedCue = normalizeProductionCue(card.meaningVi);
    const group = groups.get(normalizedCue) ?? [];
    const siblings = group.filter((candidate) => candidate.id !== card.id);
    const siblingTargets = siblings.map((candidate) => candidate.term);
    const base = {
      normalizedCue,
      prompt: card.meaningVi,
      promptDetail: promptDetailFor(card),
      collisionSiblingTargets: siblingTargets,
    };

    if (siblings.length === 0) {
      cues.set(card.id, { ...base, tier: "simple", context: null });
      continue;
    }

    const targetPos = normalizePartOfSpeech(card.partOfSpeech);
    // A missing POS is not evidence of a different POS. Keep it conservative
    // for legacy/manual cards and require safe context instead.
    const hasSamePosSibling =
      !targetPos ||
      siblings.some((sibling) => {
        const siblingPos = normalizePartOfSpeech(sibling.partOfSpeech);
        return !siblingPos || siblingPos === targetPos;
      });
    if (!hasSamePosSibling) {
      cues.set(card.id, { ...base, tier: "pos_disambiguated", context: null });
      continue;
    }

    const blanking = safelyBlankCanonicalTarget(card.exampleEn, card.term);
    if (blanking.safe) {
      cues.set(card.id, {
        ...base,
        tier: "context_disambiguated",
        context: blanking.blankedExample,
      });
      continue;
    }

    cues.set(card.id, { ...base, tier: "excluded", context: null });
  }

  return cues;
}
