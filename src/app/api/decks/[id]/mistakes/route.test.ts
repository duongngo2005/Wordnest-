import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { db } from "@/lib/db";
import { practiceEvidenceService } from "@/services/vocabulary";

describe("GET /api/decks/[id]/mistakes", () => {
  it("returns 404 when deck does not exist", async () => {
    vi.spyOn(db.deck, "findUnique").mockResolvedValue(null);

    const req = new Request("http://localhost/api/decks/non-existent/mistakes");
    const res = await GET(req, { params: Promise.resolve({ id: "non-existent" }) });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns 200 with paginated mistakes when deck exists", async () => {
    vi.spyOn(db.deck, "findUnique").mockResolvedValue({
      id: "deck-123",
      name: "IELTS Core",
    } as never);

    const mockResult = {
      mistakes: [
        {
          id: "att-1",
          flashcardId: "card-1",
          term: "ubiquitous",
          normalizedTerm: "ubiquitous",
          meaningVi: "phổ biến",
          ipa: null,
          partOfSpeech: null,
          definitionEn: null,
          exampleEn: null,
          exampleVi: null,
          questionType: "typed_vi_en",
          prompt: "phổ biến",
          userAnswer: "everywhere",
          expectedAnswer: "ubiquitous",
          attemptNumber: 1,
          responseMs: 1500,
          createdAt: new Date(),
          sessionId: "sess-1",
          derivedStatus: "NEEDS_PRACTICE" as const,
          statusExplanationVi: "Lần gần nhất chưa đúng",
          cardClassification: "NEEDS_PRACTICE" as const,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      counts: {
        all: 1,
        needsPractice: 1,
        resolved: 0,
      },
    };

    const getDeckMistakesSpy = vi
      .spyOn(practiceEvidenceService, "getDeckMistakes")
      .mockResolvedValue(mockResult);

    const req = new Request("http://localhost/api/decks/deck-123/mistakes?page=1&filter=NEEDS_PRACTICE");
    const res = await GET(req, { params: Promise.resolve({ id: "deck-123" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.deck.name).toBe("IELTS Core");
    expect(json.data.total).toBe(1);
    expect(json.data.mistakes[0].term).toBe("ubiquitous");

    expect(getDeckMistakesSpy).toHaveBeenCalledWith("deck-123", {
      page: 1,
      pageSize: 10,
      filter: "NEEDS_PRACTICE",
    });
  });
});
