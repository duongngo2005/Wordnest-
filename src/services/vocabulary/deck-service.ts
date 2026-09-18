import { db } from "@/lib/db";
import { normalizeTerm, parseVocabularyInput } from "./parser";
import { aiService } from "@/services/ai";
import { imageSearchService } from "@/services/images";
import { FlashcardStatus, Prisma } from "@prisma/client";

export interface DeckSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalCards: number;
  newCount: number;
  learningCount: number;
  knownCount: number;
}

export class DeckService {
  /**
   * Creates a new Deck and generates AI flashcards with images in one end-to-end operation.
   */
  async createDeckWithCards(rawInput: string, deckName?: string) {
    const parseResult = parseVocabularyInput(rawInput);

    if (parseResult.error) {
      throw new Error(parseResult.error);
    }

    if (parseResult.terms.length === 0) {
      throw new Error("Không tìm thấy từ vựng hợp lệ. Vui lòng kiểm tra lại danh sách từ.");
    }

    const trimmedDeckName = deckName?.trim() || "My Vocabulary";

    // 1. Generate flashcards via AI in a single batch
    const generatedCards = await aiService.generateFlashcards(parseResult.terms);

    // 2. Fetch images concurrently for items where visual aid is useful
    const cardsWithImages = await Promise.all(
      generatedCards.map(async (card) => {
        let imageUrl: string | null = null;
        let imageSource: string | null = null;
        let imageSearchQuery: string | null = card.imageSearchQuery;

        if (card.imageUseful && card.imageSearchQuery) {
          try {
            const imgResult = await imageSearchService.searchImage(card.imageSearchQuery);
            imageUrl = imgResult.imageUrl;
            imageSource = imgResult.imageSource;
            imageSearchQuery = imgResult.imageSearchQuery;
          } catch (err) {
            console.warn(`Failed fetching image for "${card.term}":`, err);
          }
        }

        return {
          ...card,
          imageUrl,
          imageSource,
          imageSearchQuery,
        };
      })
    );

    // 3. Persist to MySQL database in a transaction
    const newDeck = await db.$transaction(async (tx) => {
      const createdDeck = await tx.deck.create({
        data: {
          name: trimmedDeckName,
          description: `Bộ thẻ gồm ${cardsWithImages.length} từ vựng được tạo tự động.`,
        },
      });

      // Prepare card insertion data, ensuring normalizedTerm uniqueness per deck
      const seenNormalized = new Set<string>();
      const validCardData: Prisma.FlashcardCreateManyInput[] = [];

      for (const card of cardsWithImages) {
        const normalized = normalizeTerm(card.term);
        if (seenNormalized.has(normalized)) continue;
        seenNormalized.add(normalized);

        validCardData.push({
          deckId: createdDeck.id,
          term: card.term,
          normalizedTerm: normalized,
          meaningVi: card.meaningVi,
          definitionEn: card.definitionEn,
          ipa: card.ipa,
          partOfSpeech: card.partOfSpeech,
          cefr: card.cefr,
          exampleEn: card.exampleEn,
          exampleVi: card.exampleVi,
          imageUrl: card.imageUrl,
          imageSource: card.imageSource,
          imageSearchQuery: card.imageSearchQuery,
          status: FlashcardStatus.NEW,
        });
      }

      await tx.flashcard.createMany({
        data: validCardData,
      });

      return createdDeck;
    });

    return this.getDeckById(newDeck.id);
  }

  /**
   * Retrieves a deck with all its flashcards and calculated status statistics.
   */
  async getDeckById(deckId: string) {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      include: {
        cards: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!deck) {
      return null;
    }

    let newCount = 0;
    let learningCount = 0;
    let knownCount = 0;

    for (const card of deck.cards) {
      if (card.status === FlashcardStatus.NEW) newCount++;
      else if (card.status === FlashcardStatus.LEARNING) learningCount++;
      else if (card.status === FlashcardStatus.KNOWN) knownCount++;
    }

    return {
      ...deck,
      stats: {
        totalCards: deck.cards.length,
        newCount,
        learningCount,
        knownCount,
      },
    };
  }

  /**
   * Fetches recent decks for display on the home page.
   */
  async getRecentDecks(limit = 6): Promise<DeckSummary[]> {
    const decks = await db.deck.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        cards: {
          select: { status: true },
        },
      },
    });

    return decks.map((deck) => {
      let newCount = 0;
      let learningCount = 0;
      let knownCount = 0;

      for (const card of deck.cards) {
        if (card.status === FlashcardStatus.NEW) newCount++;
        else if (card.status === FlashcardStatus.LEARNING) learningCount++;
        else if (card.status === FlashcardStatus.KNOWN) knownCount++;
      }

      return {
        id: deck.id,
        name: deck.name,
        description: deck.description,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
        totalCards: deck.cards.length,
        newCount,
        learningCount,
        knownCount,
      };
    });
  }

  /**
   * Updates the learning status of a single flashcard (NEW, LEARNING, KNOWN).
   */
  async updateCardStatus(cardId: string, status: FlashcardStatus) {
    return db.flashcard.update({
      where: { id: cardId },
      data: { status },
    });
  }

  /**
   * Updates flashcard details (edit card).
   */
  async updateCard(
    cardId: string,
    data: {
      term?: string;
      meaningVi?: string;
      definitionEn?: string;
      ipa?: string | null;
      partOfSpeech?: string | null;
      cefr?: string | null;
      exampleEn?: string;
      exampleVi?: string;
      imageUrl?: string | null;
    }
  ) {
    return db.flashcard.update({
      where: { id: cardId },
      data: {
        ...data,
        normalizedTerm: data.term ? normalizeTerm(data.term) : undefined,
      },
    });
  }

  /**
   * Deletes a card.
   */
  async deleteCard(cardId: string) {
    return db.flashcard.delete({
      where: { id: cardId },
    });
  }

  /**
   * Deletes a deck.
   */
  async deleteDeck(deckId: string) {
    return db.deck.delete({
      where: { id: deckId },
    });
  }

  /**
   * Generates and adds flashcards to a new or existing deck from document import items.
   */
  async createCardsFromImport(options: {
    deckId?: string;
    deckName?: string;
    items: {
      term: string;
      meaning?: string;
      cefr?: string;
      originalSentence?: string;
    }[];
  }) {
    const { deckId, deckName, items } = options;

    if (!items || items.length === 0) {
      throw new Error("Vui lòng chọn ít nhất một từ vựng để tạo thẻ ghi nhớ.");
    }

    // Determine target deck
    let targetDeckId: string;
    let targetDeckName: string;

    if (deckId) {
      const existingDeck = await db.deck.findUnique({
        where: { id: deckId },
        include: { cards: { select: { normalizedTerm: true } } },
      });
      if (!existingDeck) {
        throw new Error("Không tìm thấy bộ thẻ đã chọn.");
      }
      targetDeckId = existingDeck.id;
      targetDeckName = existingDeck.name;
    } else {
      const trimmedName = deckName?.trim() || "Từ vựng từ tài liệu";
      const createdDeck = await db.deck.create({
        data: {
          name: trimmedName,
          description: `Được tạo tự động từ tài liệu với ${items.length} từ vựng.`,
        },
      });
      targetDeckId = createdDeck.id;
      targetDeckName = createdDeck.name;
    }

    // Get existing normalized terms in target deck to prevent duplicates
    const existingCards = await db.flashcard.findMany({
      where: { deckId: targetDeckId },
      select: { normalizedTerm: true },
    });
    const existingTermSet = new Set(existingCards.map((c) => c.normalizedTerm));

    // Deduplicate incoming items
    const uniqueItems: typeof items = [];
    const seenIncoming = new Set<string>();

    for (const item of items) {
      const norm = normalizeTerm(item.term);
      if (!norm || seenIncoming.has(norm) || existingTermSet.has(norm)) {
        continue;
      }
      seenIncoming.add(norm);
      uniqueItems.push(item);
    }

    if (uniqueItems.length === 0) {
      return {
        deckId: targetDeckId,
        deckName: targetDeckName,
        cardsCreated: 0,
        message: "Tất cả các từ vựng này đã tồn tại trong bộ thẻ.",
      };
    }

    // 1. Generate flashcards via AI
    const termsToGen = uniqueItems.map((u) => u.term);
    const generated = await aiService.generateFlashcards(termsToGen);

    // Map item metadata (meaning, originalSentence, cefr) to enrich generated cards
    const enrichedCards = generated.map((gen) => {
      const originalItem = uniqueItems.find(
        (u) => normalizeTerm(u.term) === normalizeTerm(gen.term)
      );

      return {
        ...gen,
        meaningVi: originalItem?.meaning || gen.meaningVi,
        cefr: originalItem?.cefr || gen.cefr,
        exampleEn: originalItem?.originalSentence || gen.exampleEn,
      };
    });

    // 2. Fetch images
    const cardsWithImages = await Promise.all(
      enrichedCards.map(async (card) => {
        let imageUrl: string | null = null;
        let imageSource: string | null = null;
        let imageSearchQuery: string | null = card.imageSearchQuery;

        if (card.imageUseful && card.imageSearchQuery) {
          try {
            const imgResult = await imageSearchService.searchImage(card.imageSearchQuery);
            imageUrl = imgResult.imageUrl;
            imageSource = imgResult.imageSource;
            imageSearchQuery = imgResult.imageSearchQuery;
          } catch (err) {
            console.warn(`Failed fetching image for "${card.term}":`, err);
          }
        }

        return {
          ...card,
          imageUrl,
          imageSource,
          imageSearchQuery,
        };
      })
    );

    // 3. Persist to DB
    const validCardData: Prisma.FlashcardCreateManyInput[] = cardsWithImages.map((card) => ({
      deckId: targetDeckId,
      term: card.term,
      normalizedTerm: normalizeTerm(card.term),
      meaningVi: card.meaningVi,
      definitionEn: card.definitionEn,
      ipa: card.ipa,
      partOfSpeech: card.partOfSpeech,
      cefr: card.cefr,
      exampleEn: card.exampleEn,
      exampleVi: card.exampleVi,
      imageUrl: card.imageUrl,
      imageSource: card.imageSource,
      imageSearchQuery: card.imageSearchQuery,
      status: FlashcardStatus.NEW,
    }));

    await db.flashcard.createMany({
      data: validCardData,
    });

    return {
      deckId: targetDeckId,
      deckName: targetDeckName,
      cardsCreated: validCardData.length,
    };
  }
}

export const deckService = new DeckService();
