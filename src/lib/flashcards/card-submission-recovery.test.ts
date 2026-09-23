import { describe, expect, it, vi } from "vitest";
import { confirmSubmittedCards } from "./card-submission-recovery";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("confirmSubmittedCards", () => {
  it("confirms a submission once every requested term appears in the deck", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, deck: { cards: [{ normalizedTerm: "attract" }] } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          deck: {
            cards: [
              { normalizedTerm: "attract" },
              { normalizedTerm: "compare" },
            ],
          },
        })
      );
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      confirmSubmittedCards({
        deckId: "deck-1",
        terms: [" Attract ", "compare"],
        fetcher,
        sleep,
        attempts: 2,
      })
    ).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenLastCalledWith("/api/decks/deck-1", { cache: "no-store" });
  });

  it("does not confirm when one or more requested terms are absent", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, deck: { cards: [{ normalizedTerm: "attract" }] } })
    );

    await expect(
      confirmSubmittedCards({
        deckId: "deck-1",
        terms: ["attract", "compare"],
        fetcher,
        sleep: vi.fn().mockResolvedValue(undefined),
        attempts: 2,
      })
    ).resolves.toBe(false);
  });
});
