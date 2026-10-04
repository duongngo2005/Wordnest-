import { z } from "zod";
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
import { normalizeStoryPlainText } from "@/lib/story/story-content";
import {
  analyzeVocabularyCoverage,
  createStoryVocabularyMetadata,
  normalizeStoryContextualTranslations,
  normalizeStoryVocabulary,
  type StoryTranslationCacheHit,
  type StoryVocabularyUsage,
} from "@/lib/story/story-vocabulary";
import { findStorySelectionCacheIndex } from "@/lib/story/story-context";
import { splitStoryIntoNarrationChunks } from "@/lib/story/story-narration";
import { getNarrationTtsService } from "@/lib/tts/tts-runtime";
import { type CloudTtsVoiceId } from "@/lib/tts/voice-catalog";
import type { ContextualTranslationResponse } from "@/lib/validation/story";

export type SelectedDeckVocabularyTerm = {
  term: string;
  partOfSpeech: string | null;
  meaningVi?: string | null;
  definitionEn?: string | null;
};

function containsVocabularyUsage(content: string, usedAs: string): boolean {
  const normalizedContent = content.trim().replace(/\s+/g, " ");
  const normalizedUsage = usedAs.trim().replace(/\s+/g, " ");
  if (!normalizedContent || !normalizedUsage) return false;
  const escaped = normalizedUsage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedContent);
}

export class StoryService {
  /**
   * Generates a story using local AI from selected vocabulary and persists to SQLite.
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

  async persistGeneratedStory({
    deckId,
    requestedTerms,
    cefr,
    length,
    topic,
    generated,
    narrationVoiceId,
  }: {
    deckId: string;
    requestedTerms: string[];
    cefr: StoryCefr;
    length: StoryLength;
    topic: StoryTopic;
    generated: z.input<typeof aiStoryResponseSchema>;
    narrationVoiceId?: CloudTtsVoiceId;
  }) {
    const parsedGenerated = aiStoryResponseSchema.parse(generated);
    const validatedGenerated = {
      ...parsedGenerated,
      title: normalizeStoryPlainText(parsedGenerated.title),
      content: normalizeStoryPlainText(parsedGenerated.content),
    };

    // Providers deployed before the new contract may only return wordsUsed. Use it
    // as a conservative compatibility fallback; invalid/non-present forms are dropped.
    const reportedUsage =
      validatedGenerated.usage.length > 0
        ? validatedGenerated.usage
        : validatedGenerated.wordsUsed.map((term) => ({ term, usedAs: term }));
    let usage = this.normalizeGeneratedUsage(
      reportedUsage.map((item) => ({ ...item, usedAs: normalizeStoryPlainText(item.usedAs) })),
      requestedTerms,
      validatedGenerated.content
    );

    // If no explicit usage matched (e.g. stories created via plain text TITLE/PASSAGE mode),
    // deterministically scan the content for the requested terms and their grammatical inflections.
    if (usage.length === 0 && requestedTerms.length > 0) {
      const coverage = analyzeVocabularyCoverage(validatedGenerated.content, requestedTerms);
      usage = coverage.used;
    }

    const contextualTranslations = normalizeStoryContextualTranslations(
      validatedGenerated.contextualTranslations,
      usage
    );

    // 3. Persist to SQLite. Translation enrichment is optional and never changes
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
          narration: { voiceIds: narrationVoiceId ? [narrationVoiceId] : [] },
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
    const story = await db.story.findUnique({
      where: { id: storyId },
      select: { content: true, targetWords: true },
    });
    if (!story) throw new Error("Không tìm thấy Story.");

    const narration = normalizeStoryVocabulary(story.targetWords).narration;
    const chunks = splitStoryIntoNarrationChunks(story.content);
    for (const voiceId of narration.voiceIds) {
      await getNarrationTtsService().removeNarration({ voiceId, chunks });
    }

    return db.story.delete({
      where: { id: storyId },
    });
  }

  /** Materializes a complete cached narration for an existing Story and records its voice. */
  async prepareStoryNarration(storyId: string, voiceId: CloudTtsVoiceId) {
    const story = await db.story.findUnique({
      where: { id: storyId },
      select: { id: true, content: true, targetWords: true },
    });
    if (!story) throw new Error("Không tìm thấy Story.");

    const chunks = splitStoryIntoNarrationChunks(story.content);
    if (chunks.length === 0) throw new Error("Story không có nội dung để tạo giọng đọc.");

    await getNarrationTtsService().synthesizeNarration({ voiceId, chunks });

    // Re-read after the slow TTS work so a contextual-translation update made
    // meanwhile is not overwritten by an older JSON snapshot.
    const latestStory = await db.story.findUnique({
      where: { id: storyId },
      select: { targetWords: true },
    });
    if (!latestStory) throw new Error("Story đã bị xóa trong khi đang nạp giọng đọc.");

    const vocabulary = normalizeStoryVocabulary(latestStory.targetWords);
    const voiceIds = vocabulary.narration.voiceIds.includes(voiceId)
      ? vocabulary.narration.voiceIds
      : [...vocabulary.narration.voiceIds, voiceId];
    await db.story.update({
      where: { id: storyId },
      data: {
        targetWords: createStoryVocabularyMetadata(vocabulary.requestedTerms, vocabulary.usage, {
          contextualTranslations: vocabulary.contextualTranslations,
          selectionTranslations: vocabulary.selectionTranslations,
          narration: { voiceIds },
        }),
      },
    });

    return { voiceIds };
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
            narration: vocabulary.narration,
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

    // 1. Check if card with this term already exists anywhere in the system
    const existing = await db.flashcard.findFirst({
      where: {
        normalizedTerm: normalized,
      },
      include: {
        deck: {
          select: {
            name: true,
            folder: { select: { name: true } },
          },
        },
      },
    });

    if (existing) {
      const isSameDeck = existing.deckId === data.deckId;
      const message = isSameDeck
        ? `Từ "${data.term}" đã có trong bộ thẻ này rồi.`
        : `Từ "${data.term}" đã tồn tại trong bộ thẻ "${existing.deck.name}"${existing.deck.folder ? ` (bộ sưu tập "${existing.deck.folder.name}")` : ""}.`;

      return {
        success: false,
        alreadyExists: true,
        message,
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

  async getSelectedDeckTerms(deckId: string, targetWords: string[]): Promise<string[]> {
    const vocabulary = await this.getSelectedDeckVocabulary(deckId, targetWords);
    return vocabulary.map((item) => item.term);
  }

  async getSelectedDeckVocabulary(
    deckId: string,
    targetWords: string[]
  ): Promise<SelectedDeckVocabularyTerm[]> {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: {
        cards: {
          select: {
            term: true,
            normalizedTerm: true,
            partOfSpeech: true,
            meaningVi: true,
            definitionEn: true,
          },
        },
      },
    });
    if (!deck) {
      throw new Error("Không tìm thấy bộ từ vựng.");
    }

    const cardsByNormalizedTerm = new Map(deck.cards.map((card) => [card.normalizedTerm, card]));
    const requestedTerms: SelectedDeckVocabularyTerm[] = [];
    const seenTerms = new Set<string>();

    for (const targetWord of targetWords) {
      const normalizedTerm = normalizeTerm(targetWord);
      const card = cardsByNormalizedTerm.get(normalizedTerm);
      if (!card) {
        throw new Error(`Từ vựng "${targetWord}" không thuộc bộ từ này.`);
      }
      if (!seenTerms.has(normalizedTerm)) {
        seenTerms.add(normalizedTerm);
        requestedTerms.push({
          term: card.term,
          partOfSpeech: card.partOfSpeech,
          meaningVi: card.meaningVi,
          definitionEn: card.definitionEn,
        });
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
