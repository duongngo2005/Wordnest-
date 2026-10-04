import { db } from "@/lib/db";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { aiService, type AIService } from "@/services/ai";
import {
  aiStoryExerciseSetSchema,
  type AIStoryExerciseSet,
} from "@/lib/validation/story-exercise";
import {
  normalizeStoryVocabulary,
} from "@/lib/story/story-vocabulary";
import {
  extractSentenceContainingUsageWithBoundary,
} from "@/lib/story/story-context";
import {
  quizService,
  sanitizeQuizQuestionForClient,
  type ServerQuizQuestion,
  type QuizQuestion,
} from "./quiz-service";
import { Flashcard, Prisma, Story } from "@prisma/client";

const QUIZ_SESSION_DURATION_MS = 30 * 60 * 1000;

export type PassageExerciseInput = {
  id: string;
  deckId: string;
  title: string;
  content: string;
  cefr: string;
  targetWords: unknown;
  sourceType?: "story" | "lesson";
};

export class StoryExerciseService {
  constructor(private readonly ai: AIService = aiService) {}

  /**
   * Generates a blended set of Passage Exercises (for Stories or Lessons):
   * 1. Reading Comprehension (AI-generated, grounded in content)
   * 2. Contextual Vocabulary (AI-generated, grounded in target words & usages)
   * 3. Passage Cloze (deterministic active recall, zero AI overhead)
   *
   * Fallback policy: If local AI is offline or encounters an error, gracefully
   * falls back to deterministic Cloze questions so the learner is never blocked.
   */
  async generateStoryExerciseQuestions(
    story: PassageExerciseInput | Story,
    cards: Flashcard[]
  ): Promise<ServerQuizQuestion[]> {
    // 1. Deterministic Story Cloze questions
    const clozeQuestions = quizService.generateStoryClozeQuestions(story, cards);

    // 2. Prepare AI-generated Comprehension & Contextual Vocabulary
    let aiQuestions: ServerQuizQuestion[] = [];
    try {
      aiQuestions = await this.generateAiGroundedQuestions(story, cards);
    } catch (error) {
      console.warn(
        `[StoryExercise] AI generation failed or timed out. Falling back to deterministic cloze. Error: ${error instanceof Error ? error.message : String(error)}`
      );
      // Graceful fallback: Cloze only
    }

    // Combine in natural pedagogical order:
    // Reading Comprehension -> Contextual Vocabulary -> Story Cloze
    const combinedQuestions: ServerQuizQuestion[] = [
      ...aiQuestions.filter((q) => q.type === "story_comprehension"),
      ...aiQuestions.filter((q) => q.type === "story_contextual_vocab"),
      ...clozeQuestions,
    ];

    if (combinedQuestions.length === 0) {
      throw new Error("Không thể tạo bài tập cho câu chuyện này. Vui lòng thử lại sau.");
    }

    return combinedQuestions;
  }

  /**
   * Creates a QuizSession for this story practice and returns questions sanitized for the client.
   */
  async createStoryPracticeSession(
    storyId: string,
    deckId: string
  ): Promise<{
    deck: { id: string; name: string };
    story: { id: string; title: string };
    sessionId: string;
    questions: QuizQuestion[];
  }> {
    const [deck, story] = await Promise.all([
      db.deck.findUnique({
        where: { id: deckId },
        include: { cards: true },
      }),
      db.story.findUnique({
        where: { id: storyId },
      }),
    ]);

    if (!deck) {
      throw new ResourceNotFoundError("Không tìm thấy bộ thẻ.");
    }
    if (!story || story.deckId !== deckId) {
      throw new ResourceNotFoundError("Không tìm thấy câu chuyện trong bộ thẻ này.");
    }

    const questions = await this.generateStoryExerciseQuestions(story, deck.cards);

    const session = await db.quizSession.create({
      data: {
        deckId,
        questions: questions as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + QUIZ_SESSION_DURATION_MS),
      },
    });

    return {
      deck: { id: deck.id, name: deck.name },
      story: { id: story.id, title: story.title },
      sessionId: session.id,
      questions: questions.map(sanitizeQuizQuestionForClient),
    };
  }

  /**
   * Creates a QuizSession for this lesson practice and returns questions sanitized for the client.
   */
  async createLessonPracticeSession(
    lessonId: string,
    deckId: string
  ): Promise<{
    deck: { id: string; name: string };
    lesson: { id: string; title: string };
    sessionId: string;
    questions: QuizQuestion[];
  }> {
    const [deck, lesson] = await Promise.all([
      db.deck.findUnique({
        where: { id: deckId },
        include: { cards: true },
      }),
      db.lesson.findUnique({
        where: { id: lessonId },
      }),
    ]);

    if (!deck) {
      throw new ResourceNotFoundError("Không tìm thấy bộ thẻ.");
    }
    if (!lesson || lesson.deckId !== deckId) {
      throw new ResourceNotFoundError("Không tìm thấy bài học trong bộ thẻ này.");
    }

    const passage: PassageExerciseInput = {
      id: lesson.id,
      deckId: lesson.deckId,
      title: lesson.title,
      content: lesson.content,
      cefr: lesson.cefr,
      targetWords: lesson.targetWords,
      sourceType: "lesson",
    };

    const questions = await this.generateStoryExerciseQuestions(passage, deck.cards);

    const session = await db.quizSession.create({
      data: {
        deckId,
        questions: questions as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + QUIZ_SESSION_DURATION_MS),
      },
    });

    return {
      deck: { id: deck.id, name: deck.name },
      lesson: { id: lesson.id, title: lesson.title },
      sessionId: session.id,
      questions: questions.map(sanitizeQuizQuestionForClient),
    };
  }

  private async generateAiGroundedQuestions(
    story: PassageExerciseInput | Story,
    cards: Flashcard[]
  ): Promise<ServerQuizQuestion[]> {
    const vocabMetadata = normalizeStoryVocabulary(story.targetWords);
    const usages = vocabMetadata.usage || [];
    const contextualTranslations = vocabMetadata.contextualTranslations || [];

    // Map cards by lowercase term and normalized term
    const cardByTerm = new Map<string, Flashcard>();
    for (const card of cards) {
      cardByTerm.set(card.term.trim().toLowerCase(), card);
      if (card.normalizedTerm) {
        cardByTerm.set(card.normalizedTerm.trim().toLowerCase(), card);
      }
    }

    // Build compact target words summary for the prompt
    const targetWordsContext = usages
      .map((u) => {
        const trans = contextualTranslations.find(
          (t) => t.term.toLowerCase() === u.term.toLowerCase()
        );
        const sentence = extractSentenceContainingUsageWithBoundary(story.content, u.usedAs);
        return `- Term: "${u.term}" (used as: "${u.usedAs}")${trans ? ` • Meaning: "${trans.meaningVi}"` : ""}${sentence ? ` • Sentence: "${sentence}"` : ""}`;
      })
      .slice(0, 8)
      .join("\n");

    const isLesson = "sourceType" in story && story.sourceType === "lesson";
    const defaultMode = isLesson ? "lesson_practice" : "story_practice";

    const systemPrompt = `You are an expert English language educator creating reading comprehension and contextual vocabulary exercises for WordNest.
All questions must be grounded strictly in the provided reading passage.
Strict rules:
1. Comprehension questions must be fully answerable solely using facts mentioned in the passage. Do NOT invent outside facts.
2. Contextual vocabulary questions must ask about the specific meaning or nuance of a target word as used in its actual passage sentence.
3. Every question must have exactly 4 plausible, distinct multiple-choice options (A, B, C, D) with exactly ONE unambiguous correct answer.
4. Keep the question language appropriate for CEFR level ${story.cefr}.
5. Respond with ONLY valid JSON adhering to the specified schema.`;

    const prompt = `Passage Title: "${story.title}"
CEFR Level: ${story.cefr}

Passage Content:
"""
${story.content}
"""

Target Vocabulary in Passage:
${targetWordsContext || "No explicit target words specified."}

Generate:
1. Exactly 3 Reading Comprehension questions about key events, ideas, or details explicitly in the passage.
2. Up to 3 Contextual Vocabulary questions focusing on target words from the list above.

JSON format:
{
  "comprehension": [
    {
      "prompt": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Exact matching string from options",
      "explanation": "1-2 sentences explaining why based on the passage"
    }
  ],
  "contextualVocabulary": [
    {
      "term": "target_word",
      "sentence": "The sentence from the passage containing the word",
      "prompt": "In this sentence, '[term]' most nearly means:",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Exact matching string from options",
      "explanation": "1-2 sentences explaining the contextual meaning in Vietnamese or English"
    }
  ]
}`;

    const rawResult: AIStoryExerciseSet = await this.ai.callStructured({
      systemPrompt,
      prompt,
      schema: aiStoryExerciseSetSchema,
      temperature: 0.2,
      timeoutMs: 30_000,
      maxRetries: 1,
    });

    const parsedQuestions: ServerQuizQuestion[] = [];
    const timestamp = Date.now();

    // 1. Process Comprehension questions
    const validComprehension = (rawResult.comprehension || []).slice(0, 3);
    for (let i = 0; i < validComprehension.length; i++) {
      const q = validComprehension[i];
      const validated = this.validateMultipleChoiceQuestion(q.prompt, q.options, q.correctAnswer);
      if (!validated) continue;

      parsedQuestions.push({
        id: `q_comp_${story.id}_${i}_${timestamp}`,
        cardId: "", // Comprehension questions have no single flashcard association
        type: "story_comprehension",
        prompt: validated.prompt,
        promptDetail: `Bài đọc: ${story.title}`,
        options: validated.options,
        correctAnswer: validated.correctAnswer,
        explanation: {
          term: story.title,
          meaningVi: q.explanation,
          definitionEn: null,
          exampleEn: null,
          exampleVi: null,
        },
        mode: defaultMode,
        selectionReason: isLesson ? "Đọc hiểu nội dung bài học" : "Đọc hiểu nội dung câu chuyện",
      });
    }

    // 2. Process Contextual Vocabulary questions
    const validVocab = (rawResult.contextualVocabulary || []).slice(0, 3);
    for (let i = 0; i < validVocab.length; i++) {
      const q = validVocab[i];
      const card = cardByTerm.get(q.term.trim().toLowerCase());
      if (!card) continue; // Must be linked to a real flashcard

      const validated = this.validateMultipleChoiceQuestion(q.prompt, q.options, q.correctAnswer);
      if (!validated) continue;

      const sentence =
        q.sentence ||
        extractSentenceContainingUsageWithBoundary(story.content, card.term) ||
        card.exampleEn ||
        null;

      parsedQuestions.push({
        id: `q_cvocab_${card.id}_${i}_${timestamp}`,
        cardId: card.id, // Linked to canonical Flashcard!
        type: "story_contextual_vocab",
        prompt: validated.prompt,
        promptDetail: sentence ? `"${sentence}"` : undefined,
        options: validated.options,
        correctAnswer: validated.correctAnswer,
        explanation: {
          term: card.term,
          ipa: card.ipa,
          partOfSpeech: card.partOfSpeech,
          meaningVi: card.meaningVi,
          definitionEn: card.definitionEn,
          exampleEn: sentence,
          exampleVi: q.explanation || card.exampleVi,
        },
        mode: defaultMode,
        selectionReason: isLesson
          ? `Từ vựng trong ngữ cảnh bài học: ${card.term}`
          : `Từ vựng trong ngữ cảnh truyện: ${card.term}`,
      });
    }

    return parsedQuestions;
  }

  /**
   * Deterministic validator for multiple choice options:
   * - Exactly 4 options
   * - No duplicates (case-insensitive)
   * - Correct answer must match one of the options
   */
  private validateMultipleChoiceQuestion(
    prompt: string,
    rawOptions: string[],
    rawCorrectAnswer: string
  ): { prompt: string; options: string[]; correctAnswer: string } | null {
    if (!prompt.trim() || rawOptions.length !== 4) return null;

    // Deduplicate options case-insensitively
    const seen = new Set<string>();
    const options: string[] = [];
    for (const opt of rawOptions) {
      const trimmed = opt.trim();
      const lower = trimmed.toLowerCase();
      if (!trimmed || seen.has(lower)) return null;
      seen.add(lower);
      options.push(trimmed);
    }

    // Match correct answer
    const trimmedCorrect = rawCorrectAnswer.trim();
    const matchingOption = options.find(
      (opt) => opt.toLowerCase() === trimmedCorrect.toLowerCase()
    );
    if (!matchingOption) return null;

    return {
      prompt: prompt.trim(),
      options,
      correctAnswer: matchingOption,
    };
  }
}

export const storyExerciseService = new StoryExerciseService();
