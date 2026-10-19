import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type DatabaseClient = Prisma.TransactionClient | typeof db;

export interface VocabularySourceLocation {
  cardId: string;
  term: string;
  deckId: string;
  deckName: string;
  folderName?: string;
}

export interface ExistingVocabularyCandidate {
  id: string;
  term: string;
  normalizedTerm: string;
  meaningVi: string;
  partOfSpeech: string | null;
  ipa: string | null;
  definitionEn: string | null;
  exampleEn: string | null;
  exampleVi: string | null;
  cefr: string | null;
  imageUrl: string | null;
  /** Optimistic-concurrency snapshot; any card mutation makes this stale. */
  contentVersion: string;
  reviewCount: number;
  fsrsState: number;
  fsrsRepetitions: number;
  locations: VocabularySourceLocation[];
}

export interface ExistingVocabularyIdentity {
  normalizedTerm: string;
  /** All retained records for the identity. Historical duplicate groups have
   * more than one id and must never be chosen implicitly. */
  cardIds: string[];
  locations: VocabularySourceLocation[];
  hasHistoricalDuplicates: boolean;
  historicalDuplicateCount: number;
  meaningVi?: string;
  partOfSpeech?: string | null;
  definitionEn?: string | null;
  exampleEn?: string | null;
  exampleVi?: string | null;
  ipa?: string | null;
  cefr?: string | null;
  imageUrl?: string | null;
  candidates: ExistingVocabularyCandidate[];
}

/**
 * Finds canonical vocabulary identities across every deck. This lookup is for
 * user-facing duplicate handling; SQLite triggers in the accompanying
 * migration are the final write-time guard against races.
 */
export async function findExistingVocabularyIdentities(
  tx: DatabaseClient,
  normalizedTerms: string[]
): Promise<Map<string, ExistingVocabularyIdentity>> {
  const requested = [...new Set(normalizedTerms.filter(Boolean))];
  if (requested.length === 0) return new Map();

  const [cards, identities] = await Promise.all([
    tx.flashcard.findMany({
      where: { normalizedTerm: { in: requested } },
      select: {
        id: true,
        term: true,
        normalizedTerm: true,
        meaningVi: true,
        partOfSpeech: true,
        definitionEn: true,
        exampleEn: true,
        exampleVi: true,
        ipa: true,
        cefr: true,
        imageUrl: true,
        updatedAt: true,
        state: true,
        reps: true,
        _count: { select: { reviewLogs: true } },
        deckMemberships: {
          orderBy: { createdAt: "asc" },
          select: {
            deck: { select: { id: true, name: true, folder: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.vocabularyIdentity.findMany({
      where: { normalizedTerm: { in: requested } },
      select: {
        normalizedTerm: true,
        hasHistoricalDuplicates: true,
        historicalDuplicateCount: true,
      },
    }),
  ]);

  const byNormalized = new Map<string, ExistingVocabularyIdentity>();
  for (const card of cards) {
    const existing = byNormalized.get(card.normalizedTerm) ?? {
      normalizedTerm: card.normalizedTerm,
      cardIds: [],
      locations: [],
      hasHistoricalDuplicates: false,
      historicalDuplicateCount: 0,
      meaningVi: card.meaningVi,
      partOfSpeech: card.partOfSpeech,
      definitionEn: card.definitionEn,
      exampleEn: card.exampleEn,
      exampleVi: card.exampleVi,
      ipa: card.ipa,
      cefr: card.cefr,
      imageUrl: card.imageUrl,
      candidates: [],
    };
    existing.cardIds.push(card.id);
    const candidateLocations: VocabularySourceLocation[] = [];
    for (const membership of card.deckMemberships) {
      const location = {
        cardId: card.id,
        term: card.term,
        deckId: membership.deck.id,
        deckName: membership.deck.name,
        folderName: membership.deck.folder?.name ?? undefined,
      };
      existing.locations.push(location);
      candidateLocations.push(location);
    }
    existing.candidates.push({
      id: card.id,
      term: card.term,
      normalizedTerm: card.normalizedTerm,
      meaningVi: card.meaningVi,
      partOfSpeech: card.partOfSpeech,
      ipa: card.ipa,
      definitionEn: card.definitionEn,
      exampleEn: card.exampleEn,
      exampleVi: card.exampleVi,
      cefr: card.cefr,
      imageUrl: card.imageUrl,
      contentVersion: card.updatedAt.toISOString(),
      reviewCount: card._count.reviewLogs,
      fsrsState: card.state,
      fsrsRepetitions: card.reps,
      locations: candidateLocations,
    });
    byNormalized.set(card.normalizedTerm, existing);
  }

  for (const identity of identities) {
    const existing = byNormalized.get(identity.normalizedTerm) ?? {
      normalizedTerm: identity.normalizedTerm,
      cardIds: [],
      locations: [],
      hasHistoricalDuplicates: false,
      historicalDuplicateCount: 0,
      candidates: [],
    };
    existing.hasHistoricalDuplicates = identity.hasHistoricalDuplicates;
    existing.historicalDuplicateCount = identity.historicalDuplicateCount;
    byNormalized.set(identity.normalizedTerm, existing);
  }

  return byNormalized;
}

export function describeExistingVocabularyLocation(existing: ExistingVocabularyIdentity): string {
  const first = existing.locations[0];
  if (!first) {
    return "một định danh từ vựng lịch sử cần được xử lý thủ công";
  }
  const source = `bộ thẻ "${first.deckName}"${first.folderName ? ` (bộ sưu tập "${first.folderName}")` : ""}`;
  return existing.locations.length > 1 ? `${source} và ${existing.locations.length - 1} nguồn khác` : source;
}

/** SQLite trigger errors do not receive Prisma's standard P2002 code. */
export function isGlobalVocabularyDuplicateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("GLOBAL_VOCABULARY_DUPLICATE");
}
