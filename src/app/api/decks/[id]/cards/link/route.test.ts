import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST } from "./route";

const deckIds = new Set<string>();
const cardIds = new Set<string>();

afterEach(async () => {
  if (deckIds.size > 0) await db.deck.deleteMany({ where: { id: { in: [...deckIds] } } });
  if (cardIds.size > 0) await db.flashcard.deleteMany({ where: { id: { in: [...cardIds] } } });
  deckIds.clear();
  cardIds.clear();
});

describe("POST /api/decks/[id]/cards/link", () => {
  it("explicitly links an unassigned canonical card without recreating its learning record", async () => {
    const source = await db.deck.create({ data: { name: "Link route source" } });
    const target = await db.deck.create({ data: { name: "Link route target" } });
    deckIds.add(source.id);
    deckIds.add(target.id);
    const term = `link-route-${crypto.randomUUID()}`;
    const card = await db.flashcard.create({
      data: { deckId: source.id, term, normalizedTerm: term, meaningVi: "liên kết" },
    });
    cardIds.add(card.id);
    await db.deck.delete({ where: { id: source.id } });
    deckIds.delete(source.id);

    const response = await POST(
      new Request(`http://localhost/api/decks/${target.id}/cards/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flashcardId: card.id }),
      }),
      { params: Promise.resolve({ id: target.id }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { linked: true, flashcardId: card.id } });
    await expect(db.flashcard.findUnique({ where: { id: card.id } })).resolves.toMatchObject({ id: card.id, reps: 0 });
    await expect(db.deckVocabularyMembership.count({ where: { deckId: target.id, flashcardId: card.id } })).resolves.toBe(1);
  });

  it("rejects an implicit link request without a card id", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/deck-1/cards/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "deck-1" }) }
    );

    expect(response.status).toBe(400);
  });
});
