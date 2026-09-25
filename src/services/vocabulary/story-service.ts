import { db } from "@/lib/db";
import { aiService } from "@/services/ai";
import { normalizeTerm } from "./parser";
import { FlashcardStatus } from "@prisma/client";
import {
  aiStoryResponseSchema,
  type AIStoryResponse,
  StoryCefr,
  StoryLength,
  StoryTopic,
  AddCardFromStoryRequest,
} from "@/lib/validation/story";
import { buildStoryPrompt } from "@/lib/story/story-prompt";
import {
  createStoryVocabularyMetadata,
  normalizeStoryContextualTranslations,
  normalizeStoryVocabulary,
  type StoryTranslationCacheHit,
  type StoryVocabularyUsage,
} from "@/lib/story/story-vocabulary";
import { findStorySelectionCacheIndex } from "@/lib/story/story-context";
import type { ContextualTranslationResponse } from "@/lib/validation/story";

function containsVocabularyUsage(content: string, usedAs: string): boolean {
  const normalizedContent = content.trim().replace(/\s+/g, " ");
  const normalizedUsage = usedAs.trim().replace(/\s+/g, " ");
  if (!normalizedContent || !normalizedUsage) return false;
  const escaped = normalizedUsage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedContent);
}

export class StoryService {
  /**
   * Generates a story using AI from selected vocabulary and persists to MySQL.
   */
  async createStory({
    deckId,
    targetWords,
    cefr = "B1",
    length = "medium",
    topic = "Daily Life",
  }: {
    deckId: string;
    targetWords: string[];
    cefr?: StoryCefr;
    length?: StoryLength;
    topic?: StoryTopic;
  }) {
    // 1. Canonicalize against deck-owned Flashcards. Target popup data is then
    // always available from the deck instead of being duplicated in Story JSON.
    const requestedTerms = await this.getSelectedDeckTerms(deckId, targetWords);

    // 2. Call AI service to generate story
    const generated = await aiService.generateStory({
      targetWords: requestedTerms,
      cefr,
      length,
      topic,
    });

    return this.persistGeneratedStory({
      deckId,
      requestedTerms,
      cefr,
      length,
      topic,
      generated,
    });
  }

  /** Persists a validated JSON result supplied by an external AI. */
  async createStoryFromJson({
    deckId,
    targetWords,
    cefr = "B1",
    length = "medium",
    topic = "Daily Life",
    generated,
  }: {
    deckId: string;
    targetWords: string[];
    cefr?: StoryCefr;
    length?: StoryLength;
    topic?: StoryTopic;
    generated: AIStoryResponse;
  }) {
    const requestedTerms = await this.getSelectedDeckTerms(deckId, targetWords);
    return this.persistGeneratedStory({ deckId, requestedTerms, cefr, length, topic, generated });
  }

  /** Returns the exact portable prompt after verifying that every term belongs to this deck. */
  async getStoryGenerationPrompt({
    deckId,
    targetWords,
    cefr = "B1",
    length = "medium",
    topic = "Daily Life",
  }: {
    deckId: string;
    targetWords: string[];
    cefr?: StoryCefr;
    length?: StoryLength;
    topic?: StoryTopic;
  }) {
    const requestedTerms = await this.getSelectedDeckTerms(deckId, targetWords);
    return buildStoryPrompt({ targetWords: requestedTerms, cefr, length, topic });
  }

  private async persistGeneratedStory({
    deckId,
    requestedTerms,
    cefr,
    length,
    topic,
    generated,
  }: {
    deckId: string;
    requestedTerms: string[];
    cefr: StoryCefr;
    length: StoryLength;
    topic: StoryTopic;
    generated: AIStoryResponse;
  }) {
    const validatedGenerated = aiStoryResponseSchema.parse(generated);

    // Providers deployed before the new contract may only return wordsUsed. Use it
    // as a conservative compatibility fallback; invalid/non-present forms are dropped.
    const reportedUsage =
      validatedGenerated.usage.length > 0
        ? validatedGenerated.usage
        : validatedGenerated.wordsUsed.map((term) => ({ term, usedAs: term }));
    const usage = this.normalizeGeneratedUsage(reportedUsage, requestedTerms, validatedGenerated.content);
    const contextualTranslations = normalizeStoryContextualTranslations(
      validatedGenerated.contextualTranslations,
      usage
    );

    // 3. Persist to MySQL. Translation enrichment is optional and never changes
    // whether the generated Story itself is accepted.
    const story = await db.story.create({
      data: {
        deckId,
        title: validatedGenerated.title,
        content: validatedGenerated.content,
        cefr,
        length,
        topic,
        targetWords: createStoryVocabularyMetadata(requestedTerms, usage, {
          contextualTranslations,
        }),
      },
    });

    return story;
  }

  /**
   * Retrieves all stories created for a given deck.
   */
  async getStoriesByDeckId(deckId: string) {
    return db.story.findMany({
      where: { deckId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a single story by its ID.
   */
  async getStoryById(storyId: string) {
    return db.story.findUnique({
      where: { id: storyId },
      include: {
        deck: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * Deletes a story.
   */
  async deleteStory(storyId: string) {
    return db.story.delete({
      where: { id: storyId },
    });
  }

  /** Looks up the persistent full-response cache used by non-target selections. */
  async findSelectionTranslation({
    storyId,
    deckId,
    selectedText,
    surroundingSentence,
  }: {
    storyId: string;
    deckId: string;
    selectedText: string;
    surroundingSentence: string;
  }): Promise<StoryTranslationCacheHit | null> {
    const story = await db.story.findFirst({
      where: { id: storyId, deckId },
      select: { targetWords: true },
    });
    if (!story) throw new Error("Không tìm thấy Story.");

    const vocabulary = normalizeStoryVocabulary(story.targetWords);
    const index = findStorySelectionCacheIndex(
      vocabulary.selectionTranslations,
      selectedText,
      surroundingSentence
    );
    if (index < 0) return null;

    const cached = vocabulary.selectionTranslations[index];
    return { translation: cached.translation, canonicalTerm: cached.canonicalTerm };
  }

  /**
   * Persists a successful lazy lookup. Target terms only retain their contextual
   * meaning; arbitrary selections retain the full payload required by the popup.
   */
  async persistContextualTranslation({
    storyId,
    deckId,
    selectedText,
    canonicalTerm,
    surroundingSentence,
    translation,
  }: {
    storyId: string;
    deckId: string;
    selectedText: string;
    canonicalTerm?: string;
    surroundingSentence: string;
    translation: ContextualTranslationResponse;
  }) {
    const story = await db.story.findFirst({
      where: { id: storyId, deckId },
      select: { id: true, targetWords: true },
    });
    if (!story) throw new Error("Không tìm thấy Story.");

    const vocabulary = normalizeStoryVocabulary(story.targetWords);
    const normalizedCanonicalTerm = canonicalTerm ? normalizeTerm(canonicalTerm) : null;
    const targetUsage = vocabulary.usage.find(
      (usage) =>
        normalizedCanonicalTerm === normalizeTerm(usage.term) &&
        normalizeTerm(selectedText) === normalizeTerm(usage.usedAs)
    );

    if (targetUsage) {
      const existing = vocabulary.contextualTranslations.filter(
        (entry) =>
          !(
            normalizeTerm(entry.term) === normalizeTerm(targetUsage.term) &&
            normalizeTerm(entry.usedAs) === normalizeTerm(targetUsage.usedAs)
          )
      );
      existing.push({
        term: targetUsage.term,
        usedAs: targetUsage.usedAs,
        meaningVi: translation.contextualMeaningVi,
      });
      vocabulary.contextualTranslations = existing;
    } else {
      const existing = vocabulary.selectionTranslations.filter(
        (entry) =>
          findStorySelectionCacheIndex([entry], selectedText, surroundingSentence) < 0
      );
      existing.push({
        selectedText: selectedText.trim(),
        canonicalTerm: canonicalTerm?.trim() || null,
        surroundingSentence: surroundingSentence.trim(),
        translation,
      });
      vocabulary.selectionTranslations = existing;
    }

    return db.story.update({
      where: { id: story.id },
      data: {
        targetWords: createStoryVocabularyMetadata(
          vocabulary.requestedTerms,
          vocabulary.usage,
          {
            contextualTranslations: vocabulary.contextualTranslations,
            selectionTranslations: vocabulary.selectionTranslations,
          }
        ),
      },
    });
  }

  /**
   * Adds a new flashcard to the deck directly from a story reading session.
   * Prevents duplicates by checking normalizedTerm within the same deck.
   */
  async addCardFromStory(data: AddCardFromStoryRequest) {
    const normalized = normalizeTerm(data.term);

    // 1. Check if card with this term already exists in the deck
    const existing = await db.flashcard.findUnique({
      where: {
        deckId_normalizedTerm: {
          deckId: data.deckId,
          normalizedTerm: normalized,
        },
      },
    });

    if (existing) {
      return {
        success: false,
        alreadyExists: true,
        message: `Từ "${data.term}" đã có trong bộ thẻ này rồi.`,
        card: existing,
      };
    }

    // 2. Create the new flashcard
    const created = await db.flashcard.create({
      data: {
        deckId: data.deckId,
        term: data.term,
        normalizedTerm: normalized,
        meaningVi: data.meaningVi,
        definitionEn: data.definitionEn,
        ipa: data.ipa || null,
        partOfSpeech: data.partOfSpeech || null,
        cefr: data.cefr || null,
        exampleEn: data.exampleEn,
        exampleVi: data.exampleVi,
        status: FlashcardStatus.NEW,
      },
    });

    return {
      success: true,
      alreadyExists: false,
      message: `Đã thêm "${data.term}" vào bộ thẻ thành công!`,
      card: created,
    };
  }

  private async getSelectedDeckTerms(deckId: string, targetWords: string[]): Promise<string[]> {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { cards: { select: { term: true, normalizedTerm: true } } },
    });
    if (!deck) {
      throw new Error("Không tìm thấy bộ từ vựng.");
    }

    const cardsByNormalizedTerm = new Map(
      deck.cards.map((card) => [card.normalizedTerm, card.term])
    );
    const requestedTerms: string[] = [];
    const seenTerms = new Set<string>();

    for (const targetWord of targetWords) {
      const normalizedTerm = normalizeTerm(targetWord);
      const canonicalTerm = cardsByNormalizedTerm.get(normalizedTerm);
      if (!canonicalTerm) {
        throw new Error(`Từ vựng "${targetWord}" không thuộc bộ từ này.`);
      }
      if (!seenTerms.has(normalizedTerm)) {
        seenTerms.add(normalizedTerm);
        requestedTerms.push(canonicalTerm);
      }
    }

    return requestedTerms;
  }

  private normalizeGeneratedUsage(
    generatedUsage: StoryVocabularyUsage[],
    requestedTerms: string[],
    content: string
  ): StoryVocabularyUsage[] {
    const requestedByNormalizedTerm = new Map(
      requestedTerms.map((term) => [normalizeTerm(term), term])
    );
    const seen = new Set<string>();
    const usage: StoryVocabularyUsage[] = [];

    for (const item of generatedUsage) {
      const canonicalTerm = requestedByNormalizedTerm.get(normalizeTerm(item.term));
      if (!canonicalTerm || seen.has(normalizeTerm(canonicalTerm))) continue;
      if (!containsVocabularyUsage(content, item.usedAs)) continue;
      seen.add(normalizeTerm(canonicalTerm));
      usage.push({ term: canonicalTerm, usedAs: item.usedAs.trim() });
    }

    return usage;
  }
}

export const storyService = new StoryService();
