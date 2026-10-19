import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { GET, POST } from "./route";
import { POST as checkAnswer } from "./check/route";

describe("global typing API", () => {
  it("validates setup options and keeps answers server-side until checking", async () => {
    const invalid = await GET(new Request("http://localhost/api/practice/global-typing?count=12"));
    expect(invalid.status).toBe(400);

    const deck = await db.deck.create({ data: { name: "Global typing API" } });
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "allocate",
        normalizedTerm: "allocate",
        meaningVi: "phân bổ",
        partOfSpeech: "verb",
      },
    });
    const response = await GET(new Request("http://localhost/api/practice/global-typing?mode=all&count=10"));
    expect(response.status).toBe(200);
    const body = await response.json();
    const question = body.data.questions[0];
    expect(question).toMatchObject({ type: "typed_vi_en", prompt: "phân bổ" });
    expect(question.correctAnswer).toBeUndefined();
    expect(question.explanation).toBeUndefined();
    expect(question.spellingHints).toBeUndefined();
    expect(question.letterHint).toMatch(/_/);
    expect(question.letterHint).not.toBe("a l l o c a t e");
  });

  it("scores on the server then claims its session once when saving", async () => {
    const deck = await db.deck.create({ data: { name: "Global typing API save" } });
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "resilient",
        normalizedTerm: "resilient",
        meaningVi: "kiên cường",
        partOfSpeech: "adjective",
      },
    });
    const created = await GET(new Request("http://localhost/api/practice/global-typing?count=10"));
    const createdBody = await created.json();
    const { sessionId, questions } = createdBody.data;
    const checked = await checkAnswer(
      new Request("http://localhost/api/practice/global-typing/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, questionId: questions[0].id, answer: "resilient" }),
      })
    );
    expect(checked.status).toBe(200);
    await expect(checked.json()).resolves.toMatchObject({ success: true, data: { correct: true } });

    const stored = await db.quizSession.findUniqueOrThrow({ where: { id: sessionId } });
    const storedQuestions = stored.questions as Array<{ id: string; correctAnswer: string }>;
    const request = () => new Request("http://localhost/api/practice/global-typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        answers: storedQuestions.map((question) => ({ questionId: question.id, answer: question.correctAnswer })),
      }),
    });
    const [first, second] = await Promise.all([POST(request()), POST(request())]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await db.practiceAttempt.count({ where: { sessionId } })).toBe(1);
  });

  it("accepts all 50 first-pass answers and their 50 permitted retries", async () => {
    const deck = await db.deck.create({ data: { name: "Global typing API maximum retries" } });
    await db.flashcard.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        deckId: deck.id,
        term: `word-${index}`,
        normalizedTerm: `word-${index}`,
        meaningVi: `nghĩa riêng ${index}`,
        partOfSpeech: "noun",
      })),
    });

    const created = await GET(new Request("http://localhost/api/practice/global-typing?mode=all&count=50"));
    const createdBody = await created.json();
    const { sessionId } = createdBody.data;
    const stored = await db.quizSession.findUniqueOrThrow({ where: { id: sessionId } });
    const questions = stored.questions as Array<{ id: string; correctAnswer: string }>;
    expect(questions).toHaveLength(50);

    const response = await POST(new Request("http://localhost/api/practice/global-typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        answers: questions.flatMap((question) => [
          { questionId: question.id, attemptNumber: 1, answer: `incorrect-${question.id}` },
          { questionId: question.id, attemptNumber: 2, answer: question.correctAnswer },
        ]),
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { firstPassTotal: 50, retryTotal: 50 },
    });
  });
});
