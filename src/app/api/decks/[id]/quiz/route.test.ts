import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { quizService } from "@/services/vocabulary";
import { POST } from "./route";

describe("POST /api/decks/[id]/quiz", () => {
  const deckIds: string[] = [];

  afterEach(async () => {
    await Promise.all(deckIds.splice(0).map((id) => db.deck.delete({ where: { id } })));
  });

  it("returns 400, not 500, for answers that do not match the server session", async () => {
    const deck = await db.deck.create({ data: { name: "Quiz route validation" } });
    deckIds.push(deck.id);
    await db.flashcard.createMany({
      data: [
        {
          deckId: deck.id,
          term: "resilient",
          normalizedTerm: "resilient",
          meaningVi: "kiên cường",
          definitionEn: "able to recover",
          exampleEn: "She is resilient.",
          exampleVi: "Cô ấy kiên cường.",
        },
        {
          deckId: deck.id,
          term: "ephemeral",
          normalizedTerm: "ephemeral",
          meaningVi: "phù du",
          definitionEn: "lasting briefly",
          exampleEn: "Fame is ephemeral.",
          exampleVi: "Danh tiếng phù du.",
        },
      ],
    });
    const quiz = await quizService.getDeckQuiz(deck.id, 2);
    const answer = {
      questionId: quiz.questions[0].id,
      answer: quiz.questions[0].correctAnswer,
    };

    const response = await POST(
      new Request(`http://localhost/api/decks/${deck.id}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: quiz.sessionId, answers: [answer, answer] }),
      }),
      { params: Promise.resolve({ id: deck.id }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it("rejects a negative response time at the API boundary", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/any/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session",
          answers: [{ questionId: "question", answer: "answer", responseMs: -1 }],
        }),
      }),
      { params: Promise.resolve({ id: "any" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });

  it("GET with mode=typed returns questions without leaking correctAnswer, options, or explanation", async () => {
    const deck = await db.deck.create({ data: { name: "GET typed quiz test" } });
    deckIds.push(deck.id);
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "allocate",
        normalizedTerm: "allocate",
        meaningVi: "phân bổ",
        definitionEn: "distribute resources",
        exampleEn: "We allocate funds.",
        exampleVi: "Chúng tôi phân bổ quỹ.",
      },
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request(`http://localhost/api/decks/${deck.id}/quiz?mode=typed`),
      { params: Promise.resolve({ id: deck.id }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.questions).toHaveLength(1);

    const q = body.data.questions[0];
    expect(q.type).toBe("typed_vi_en");
    expect(q.prompt).toBe("phân bổ");
    expect(q.correctAnswer).toBeUndefined();
    expect(q.options).toBeUndefined();
    expect(q.explanation).toBeUndefined();
  });

  it("POST /check scores typed answer server-side and returns feedback without claiming session", async () => {
    const deck = await db.deck.create({ data: { name: "POST check test" } });
    deckIds.push(deck.id);
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "allocate",
        normalizedTerm: "allocate",
        meaningVi: "phân bổ",
        definitionEn: "distribute resources",
        exampleEn: "We allocate funds.",
        exampleVi: "Chúng tôi phân bổ quỹ.",
      },
    });

    const quiz = await quizService.getDeckQuiz(deck.id, 1, ["typed_vi_en"]);
    const { POST: POSTCheck } = await import("./check/route");

    // Check wrong spelling
    const wrongRes = await POSTCheck(
      new Request(`http://localhost/api/decks/${deck.id}/quiz/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: quiz.sessionId,
          questionId: quiz.questions[0].id,
          answer: "alocate",
        }),
      }),
      { params: Promise.resolve({ id: deck.id }) }
    );

    expect(wrongRes.status).toBe(200);
    const wrongBody = await wrongRes.json();
    expect(wrongBody.success).toBe(true);
    expect(wrongBody.data.correct).toBe(false);
    expect(wrongBody.data.expectedAnswer).toBe("allocate");

    // Check normalized correct answer
    const correctRes = await POSTCheck(
      new Request(`http://localhost/api/decks/${deck.id}/quiz/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: quiz.sessionId,
          questionId: quiz.questions[0].id,
          answer: "  ALLOCATE.  ",
        }),
      }),
      { params: Promise.resolve({ id: deck.id }) }
    );

    expect(correctRes.status).toBe(200);
    const correctBody = await correctRes.json();
    expect(correctBody.success).toBe(true);
    expect(correctBody.data.correct).toBe(true);
    expect(correctBody.data.expectedAnswer).toBe("allocate");
    expect(correctBody.data.explanation.term).toBe("allocate");
  });

  it("GET with mode=story_cloze returns cloze questions without leaking usedAs or correctAnswer", async () => {
    const deck = await db.deck.create({ data: { name: "GET story cloze test" } });
    deckIds.push(deck.id);
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "allocate",
        normalizedTerm: "allocate",
        meaningVi: "phân bổ",
      },
    });

    const story = await db.story.create({
      data: {
        deckId: deck.id,
        title: "Test Cloze Story",
        content: "The company allocated substantial funds to security.",
        cefr: "B2",
        length: "Short",
        topic: "Business",
        targetWords: {
          schemaVersion: 3,
          requestedTerms: ["allocate"],
          usage: [{ term: "allocate", usedAs: "allocated" }],
        },
      },
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request(`http://localhost/api/decks/${deck.id}/quiz?mode=story_cloze&storyId=${story.id}`),
      { params: Promise.resolve({ id: deck.id }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.questions).toHaveLength(1);

    const q = body.data.questions[0];
    expect(q.type).toBe("story_cloze");
    expect(q.prompt).toBe("The company ______ substantial funds to security.");
    expect(q.correctAnswer).toBeUndefined();
    expect(q.expectedAnswer).toBeUndefined();
    expect(q.usedAs).toBeUndefined();
    expect(q.explanation).toBeUndefined();
  });
});
