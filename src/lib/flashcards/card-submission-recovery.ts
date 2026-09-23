import { normalizeTerm } from "@/services/vocabulary/parser";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Sleeper = (milliseconds: number) => Promise<void>;

interface ConfirmSubmittedCardsOptions {
  deckId: string;
  terms: string[];
  attempts?: number;
  intervalMs?: number;
  fetcher?: Fetcher;
  sleep?: Sleeper;
}

interface DeckCardsResponse {
  success?: unknown;
  deck?: {
    cards?: Array<{
      normalizedTerm?: unknown;
    }>;
  };
}

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_INTERVAL_MS = 2_000;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasAllSubmittedTerms(data: unknown, expectedTerms: Set<string>): boolean {
  if (!data || typeof data !== "object") return false;

  const response = data as DeckCardsResponse;
  if (response.success !== true || !Array.isArray(response.deck?.cards)) return false;

  const deckTerms = new Set(
    response.deck.cards.flatMap((card) =>
      typeof card.normalizedTerm === "string" ? [normalizeTerm(card.normalizedTerm)] : []
    )
  );

  return [...expectedTerms].every((term) => deckTerms.has(term));
}

/**
 * A POST can outlive a mobile client's connection while AI generation is running.
 * This read-only check prevents reporting a false failure when the server finishes
 * persisting the cards after that connection is lost.
 */
export async function confirmSubmittedCards({
  deckId,
  terms,
  attempts = DEFAULT_ATTEMPTS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetcher = fetch,
  sleep = wait,
}: ConfirmSubmittedCardsOptions): Promise<boolean> {
  const expectedTerms = new Set(terms.map(normalizeTerm).filter(Boolean));
  if (expectedTerms.size === 0) return false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(`/api/decks/${deckId}`, { cache: "no-store" });
      const data: unknown = response.ok ? await response.json().catch(() => null) : null;

      if (hasAllSubmittedTerms(data, expectedTerms)) return true;
    } catch {
      // The connection may still be recovering; the next read-only attempt can confirm it.
    }

    if (attempt < attempts - 1) await sleep(intervalMs);
  }

  return false;
}
