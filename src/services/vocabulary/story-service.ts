import { db } from "@/lib/db";
import { aiService } from "@/services/ai";
import { normalizeTerm } from "./parser";
import { FlashcardStatus } from "@prisma/client";
import {
  StoryCefr,
  StoryLength,
  StoryTopic,
  AddCardFromStoryRequest,
} from "@/lib/validation/story";

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
    // 1. Verify deck exists
    const deck = await db.deck.findUnique({
      where: { id: deckId },
    });
    if (!deck) {
      throw new Error("Không tìm thấy bộ từ vựng.");
    }

    // 2. Call AI service to generate story
    const generated = await aiService.generateStory({
      targetWords,
      cefr,
      length,
      topic,
    });

    // 3. Persist to MySQL
    const story = await db.story.create({
      data: {
        deckId,
        title: generated.title,
        content: generated.content,
        cefr,
        length,
        topic,
        targetWords: generated.wordsUsed.length > 0 ? generated.wordsUsed : targetWords,
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
}

export const storyService = new StoryService();
