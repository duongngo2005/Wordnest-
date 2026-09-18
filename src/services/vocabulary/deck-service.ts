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
}

export const deckService = new DeckService();
