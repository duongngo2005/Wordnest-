import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { GET, POST } from "./route";
import { globalTypingPracticeService } from "@/services/vocabulary";

describe("due typing API", () => {
  it("creates a due-only snapshot without exposing answers and claims it once on save", async () => {
    const now = new Date();
    const deck = await db.deck.create({ data: { name: "Due typing API" } });
    const due = await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "abundance",
        normalizedTerm: "abundance",
        meaningVi: "sự dồi dào",
        partOfSpeech: "noun",
        state: 2,
        due: new Date(now.getTime() - 60_000),
      },
    });
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "future",
        normalizedTerm: "future",
        meaningVi: "tương lai",
        partOfSpeech: "noun",
        state: 2,
        due: new Date(now.getTime() + 60_000),
      },
    });

    const created = await GET();
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    const { sessionId, questions } = createdBody.data;
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ cardId: due.id, prompt: "sự dồi dào", mode: "due_typing" });
    expect(questions[0].correctAnswer).toBeUndefined();
    expect(questions[0].spellingHints).toBeUndefined();
    expect(questions[0].letterHint).toMatch(/_/);
    expect(questions[0].letterHint).not.toBe("a b u n d a n c e");

    const stored = await db.quizSession.findUniqueOrThrow({ where: { id: sessionId } });
    const storedQuestions = stored.questions as Array<{ id: string; correctAnswer: string }>;
    const request = () => new Request("http://localhost/api/practice/due-typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        answers: storedQuestions.map((question) => ({ questionId: question.id, answer: question.correctAnswer })),
      }),
    });

    const [first, second] = await Promise.all([POST(request()), POST(request())]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    await expect(
      db.practiceAttempt.findMany({ where: { sessionId } })
    ).resolves.toEqual([
      expect.objectContaining({ flashcardId: due.id, mode: "due_typing", correct: true }),
    ]);
    await expect(db.reviewLog.count({ where: { cardId: due.id } })).resolves.toBe(0);
  });

  it("does not accept a global typing session through the due-only endpoint", async () => {
    const deck = await db.deck.create({ data: { name: "Due typing source isolation" } });
    await db.flashcard.create({
      data: {
        deckId: deck.id,
        term: "isolate",
        normalizedTerm: "isolate",
        meaningVi: "cô lập",
        partOfSpeech: "verb",
      },
    });
    const session = await globalTypingPracticeService.createSession({ count: 10 }, new Date(), () => 0.5);
    const stored = await db.quizSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    const questions = stored.questions as Array<{ id: string; correctAnswer: string }>;

    const response = await POST(new Request("http://localhost/api/practice/due-typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        answers: questions.map((question) => ({ questionId: question.id, answer: question.correctAnswer })),
      }),
    }));

    expect(response.status).toBe(409);
    await expect(db.quizSession.findUnique({ where: { id: session.sessionId } })).resolves.not.toBeNull();
    await expect(db.practiceAttempt.count({ where: { sessionId: session.sessionId } })).resolves.toBe(0);
  });

  it("accepts all 100 due answers and their 100 permitted retries", async () => {
    const deck = await db.deck.create({ data: { name: "Due typing API maximum retries" } });
    const due = new Date(Date.now() - 60_000);
    await db.flashcard.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        deckId: deck.id,
        term: `due-word-${index}`,
        normalizedTerm: `due-word-${index}`,
        meaningVi: `nghĩa đến hạn ${index}`,
        partOfSpeech: "noun",
        state: 2,
        due,
      })),
    });

    const created = await GET();
    const createdBody = await created.json();
    const { sessionId } = createdBody.data;
    const stored = await db.quizSession.findUniqueOrThrow({ where: { id: sessionId } });
    const questions = stored.questions as Array<{ id: string; correctAnswer: string }>;
    expect(questions).toHaveLength(100);

    const response = await POST(new Request("http://localhost/api/practice/due-typing", {
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
      data: { firstPassTotal: 100, retryTotal: 100 },
    });
  });
});
