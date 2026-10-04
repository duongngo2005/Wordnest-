import { z } from "zod";
import { db } from "@/lib/db";
import { aiService, type AIService } from "@/services/ai";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { StoryCefr } from "@/lib/validation/story";
import { buildLessonPrompt } from "@/lib/lesson/lesson-prompt";
import { normalizeStoryPlainText } from "@/lib/story/story-content";
import {
  analyzeVocabularyCoverage,
  createStoryVocabularyMetadata,
  type StoryVocabularyUsage,
} from "@/lib/story/story-vocabulary";
import { normalizeTerm } from "./parser";
import { Flashcard, Prisma } from "@prisma/client";
import type { AiJobStage } from "@/services/ai/ai-job-service";

export type CreateLessonOptions = {
  deckId: string;
  targetWords: string[]; // Flashcard IDs or terms
  cefr?: StoryCefr;
  topic?: string;
  signal?: AbortSignal;
  onStageChange?: (stage: AiJobStage, progress: number) => Promise<void>;
};

const lessonAiOutputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
});

export class LessonService {
  constructor(private readonly ai: AIService = aiService) {}

  /**
   * Generates a focused educational lesson passage for selected vocabulary in a deck.
   * Unlike fictional stories, lessons focus on realistic situations and clear contextual clues.
   */
  async createLesson({
    deckId,
    targetWords,
    cefr = "B1",
    topic = "Everyday Situations & Communication",
    signal,
    onStageChange,
  }: CreateLessonOptions) {
    if (!targetWords || targetWords.length === 0) {
      throw new Error("Vui lòng chọn ít nhất một từ vựng để tạo bài học.");
    }

    // 1. Resolve deck and verify cards
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      include: { cards: true },
    });

    if (!deck) {
      throw new ResourceNotFoundError("Không tìm thấy bộ thẻ.");
    }

    const requestedCards = this.resolveRequestedCards(deck.cards, targetWords);
    if (requestedCards.length === 0) {
      throw new Error("Không tìm thấy từ vựng hợp lệ nào trong bộ thẻ đã chọn.");
    }

    // 2. Stage: generating_lesson
    await onStageChange?.("generating_lesson", 20);

    const prompt = buildLessonPrompt({
      targetWords: requestedCards.map((c) => ({
        term: c.term,
        meaningVi: c.meaningVi,
        partOfSpeech: c.partOfSpeech,
      })),
      cefr,
      topic,
    });

    const generated = await this.ai.callStructured({
      prompt,
      schema: lessonAiOutputSchema,
      temperature: 0.2,
      timeoutMs: 45_000,
      maxRetries: 1,
      signal,
    });

    let currentTitle = normalizeStoryPlainText(generated.title);
    let currentContent = normalizeStoryPlainText(generated.content);

    // 3. Stage: validating_vocabulary & coverage analysis
    await onStageChange?.("validating_vocabulary", 50);

    let coverage = analyzeVocabularyCoverage(
      currentContent,
      requestedCards.map((c) => c.term)
    );

    // 4. Targeted repair if some words were missed
    if (coverage.missing.length > 0) {
      await onStageChange?.("repairing_lesson", 65);
      try {
        const repairPrompt = `You wrote the following educational lesson passage for CEFR ${cefr}:
Title: "${currentTitle}"
Content:
"""
${currentContent}
"""

However, these target words were NOT included or need to be naturally integrated:
${coverage.missing.map((term) => `- "${term}"`).join("\n")}

Please rewrite or extend the passage to naturally incorporate ALL missing target words with clear contextual clues while maintaining educational coherence and CEFR ${cefr} level.
Respond with ONLY valid JSON:
{
  "title": "${currentTitle}",
  "content": "Full revised passage text here (~120-220 words)."
}`;

        const repaired = await this.ai.callStructured({
          prompt: repairPrompt,
          schema: lessonAiOutputSchema,
          temperature: 0.2,
          timeoutMs: 40_000,
          maxRetries: 1,
          signal,
        });

        const repairedContent = normalizeStoryPlainText(repaired.content);
        const repairedCoverage = analyzeVocabularyCoverage(
          repairedContent,
          requestedCards.map((c) => c.term)
        );

        if (repairedCoverage.used.length >= coverage.used.length) {
          currentTitle = normalizeStoryPlainText(repaired.title) || currentTitle;
          currentContent = repairedContent;
          coverage = repairedCoverage;
        }
      } catch (repairError) {
        console.warn(
          `[LessonService] Targeted repair failed, proceeding with original content: ${repairError instanceof Error ? repairError.message : String(repairError)}`
        );
      }
    }

    if (coverage.used.length === 0) {
      throw new Error(
        "Không thể tích hợp từ vựng mục tiêu vào bài học. Vui lòng thử lại với chủ đề hoặc từ vựng khác."
      );
    }

    // 5. Stage: generating_translations
    await onStageChange?.("generating_translations", 80);

    const cardByTerm = new Map(
      requestedCards.map((c) => [normalizeTerm(c.term), c])
    );

    const contextualTranslations = coverage.used.map((u) => {
      const card = cardByTerm.get(normalizeTerm(u.term));
      return {
        term: u.term,
        usedAs: u.usedAs,
        meaningVi: card?.meaningVi || u.term,
      };
    });

    const sanitizedUsage: StoryVocabularyUsage[] = coverage.used.map((u) => ({
      term: u.term,
      usedAs: u.usedAs,
    }));

    // 6. Stage: saving
    await onStageChange?.("saving", 95);

    const lesson = await db.lesson.create({
      data: {
        deckId,
        title: currentTitle,
        content: currentContent,
        cefr,
        targetWords: createStoryVocabularyMetadata(
          requestedCards.map((c) => c.term),
          sanitizedUsage,
          { contextualTranslations }
        ) as unknown as Prisma.InputJsonValue,
      },
    });

    return lesson;
  }

  /**
   * Retrieves all lessons for a deck.
   */
  async getLessonsByDeckId(deckId: string) {
    return db.lesson.findMany({
      where: { deckId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a single lesson by ID with deck info.
   */
  async getLessonById(lessonId: string) {
    return db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        deck: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * Deletes a lesson.
   */
  async deleteLesson(lessonId: string) {
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!lesson) {
      throw new ResourceNotFoundError("Không tìm thấy bài học.");
    }

    return db.lesson.delete({
      where: { id: lessonId },
    });
  }

  /**
   * Resolves requested targets against deck cards by ID or term.
   */
  private resolveRequestedCards(cards: Flashcard[], targetWords: string[]): Flashcard[] {
    const cardById = new Map<string, Flashcard>();
    const cardByTerm = new Map<string, Flashcard>();

    for (const card of cards) {
      cardById.set(card.id, card);
      cardByTerm.set(normalizeTerm(card.term), card);
      if (card.normalizedTerm) {
        cardByTerm.set(normalizeTerm(card.normalizedTerm), card);
      }
    }

    const resolved: Flashcard[] = [];
    const seenIds = new Set<string>();

    for (const target of targetWords) {
      const match = cardById.get(target) || cardByTerm.get(normalizeTerm(target));
      if (match && !seenIds.has(match.id)) {
        seenIds.add(match.id);
        resolved.push(match);
      }
    }

    return resolved;
  }
}

export const lessonService = new LessonService();
