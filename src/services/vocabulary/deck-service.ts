import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { normalizeTerm, parseVocabularyInput } from "./parser";
import { aiService } from "@/services/ai";
import { imageSearchService } from "@/services/images";
import { FlashcardStatus, Prisma } from "@prisma/client";
import {
  AUTO_IMAGE_MIN_SCORE,
  CEFR_LEVELS,
  isSupportedPartOfSpeech,
  ManualFlashcardItem,
  UpdateFlashcardRequest,
} from "@/lib/validation/flashcard";
import {
  JsonFlashcard,
  parseJsonFlashcardImport,
} from "@/lib/flashcards/json-import";

export class JsonFlashcardImportError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors[0] || "Dữ liệu JSON flashcard không hợp lệ.");
    this.name = "JsonFlashcardImportError";
  }
}

export class DuplicateFlashcardTermError extends Error {
  constructor() {
    super("Thuật ngữ này đã có trong bộ thẻ. Hãy chọn một thuật ngữ khác.");
    this.name = "DuplicateFlashcardTermError";
  }
}

export class CardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardValidationError";
  }
}

function cleanupLocalCardImage(imageUrl: string | null | undefined) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/cards/")) return;
  try {
    const filename = path.basename(imageUrl);
    const filePath = path.join(process.cwd(), "public", "uploads", "cards", filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn("[deckService] Failed to clean up local card image:", err);
  }
}

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

export interface DeckOption {
  id: string;
  name: string;
}

export class DeckService {
  /**
   * Creates a new Deck and generates AI flashcards with images in one end-to-end operation.
   */
  async createDeckWithCards(rawInput: string, deckName?: string, folderId?: string) {
    const parseResult = parseVocabularyInput(rawInput);

    if (parseResult.error) {
      throw new Error(parseResult.error);
    }

    if (parseResult.terms.length === 0) {
      throw new Error("Không tìm thấy từ vựng hợp lệ. Vui lòng kiểm tra lại danh sách từ.");
    }

    const trimmedDeckName = deckName?.trim() || "My Vocabulary";

    if (folderId) {
      const folder = await db.folder.findUnique({ where: { id: folderId }, select: { id: true } });
      if (!folder) throw new ResourceNotFoundError("Không tìm thấy learning collection.");
    }

    // 1. Generate flashcards via AI in a single batch
    const generatedCards = await aiService.generateFlashcards(parseResult.terms);

    // 2. Fetch images sequentially to deduplicate within the same batch and respect AUTO_IMAGE_MIN_SCORE
    const usedImageUrls = new Set<string>();
    const cardsWithImages: (typeof generatedCards[number] & {
      imageUrl: string | null;
      imageSource: string | null;
      imageSearchQuery: string | null;
      imagePageUrl: string | null;
      imageAuthor: string | null;
      imageLicense: string | null;
    })[] = [];

    for (const card of generatedCards) {
      let imageUrl: string | null = null;
      let imageSource: string | null = null;
      let imageSearchQuery: string | null = card.imageSearchQuery;
      let imagePageUrl: string | null = null;
      let imageAuthor: string | null = null;
      let imageLicense: string | null = null;

      const isVisual =
        card.visualScore !== undefined
          ? card.visualScore >= AUTO_IMAGE_MIN_SCORE
          : Boolean(card.imageUseful);
      const shouldSearch = isVisual && Boolean(card.imageSearchQuery);

      if (shouldSearch && card.imageSearchQuery) {
        try {
          const imgResult = await imageSearchService.searchImageForVocabulary(
            card.term,
            card.imageSearchQuery,
            { usedUrls: usedImageUrls }
          );
          if (imgResult.imageUrl && !usedImageUrls.has(imgResult.imageUrl)) {
            imageUrl = imgResult.imageUrl;
            imageSource = "AUTO";
            imageSearchQuery = imgResult.imageSearchQuery;
            imagePageUrl = imgResult.imagePageUrl || null;
            imageAuthor = imgResult.imageAuthor || null;
            imageLicense = imgResult.imageLicense || null;
            usedImageUrls.add(imgResult.imageUrl);
          }
        } catch (err) {
          console.warn(`Failed fetching image for "${card.term}":`, err);
        }
      }

      cardsWithImages.push({
        ...card,
        imageUrl,
        imageSource,
        imageSearchQuery,
        imagePageUrl,
        imageAuthor,
        imageLicense,
      });
    }

    // 3. Persist to MySQL database in a transaction
    const newDeck = await db.$transaction(async (tx) => {
      const createdDeck = await tx.deck.create({
        data: {
          name: trimmedDeckName,
          description: `Bộ thẻ gồm ${cardsWithImages.length} từ vựng được tạo tự động.`,
          folderId: folderId ?? null,
          position: await this.getNextFolderDeckPosition(tx, folderId),
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
          imagePageUrl: card.imagePageUrl,
          imageAuthor: card.imageAuthor,
          imageLicense: card.imageLicense,
          status: FlashcardStatus.NEW,
          state: 0,
          due: new Date(),
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
        folder: { select: { name: true } },
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
   * Minimal deck data for routes that only need identity and card count.
   */
  async getDeckOverview(deckId: string) {
    return db.deck.findUnique({
      where: { id: deckId },
      select: {
        id: true,
        name: true,
        _count: { select: { cards: true } },
      },
    });
  }

  /**
   * Minimal data required to create a story from a deck.
   */
  async getDeckStoryData(deckId: string) {
    return db.deck.findUnique({
      where: { id: deckId },
      select: {
        id: true,
        name: true,
        cards: {
          select: { term: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /** Static lexical fields for target words only, suitable for the Story popup. */
  async getStoryFlashcards(deckId: string, terms: string[]) {
    const normalizedTerms = [...new Set(terms.map(normalizeTerm).filter(Boolean))];
    if (normalizedTerms.length === 0) return [];

    return db.flashcard.findMany({
      where: { deckId, normalizedTerm: { in: normalizedTerms } },
      select: {
        term: true,
        meaningVi: true,
        definitionEn: true,
        ipa: true,
        partOfSpeech: true,
        cefr: true,
        exampleEn: true,
        exampleVi: true,
      },
    });
  }

  /**
   * Lightweight deck list for selectors that do not display card statistics.
   */
  async getDeckOptions(limit = 50): Promise<DeckOption[]> {
    return db.deck.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    });
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
   * Updates flashcard details (edit card).
   */
  async updateCard(
    cardId: string,
    data: UpdateFlashcardRequest
  ) {
    try {
      const lexicalData: UpdateFlashcardRequest = {
        ...data,
        term: data.term?.trim(),
        meaningVi: data.meaningVi?.trim(),
      };
      const existingCard = await db.flashcard.findUnique({
        where: { id: cardId },
        select: { partOfSpeech: true, cefr: true, imageUrl: true },
      });
      if (!existingCard) throw new ResourceNotFoundError("Không tìm thấy thẻ từ vựng.");

      // Preserve an untouched legacy free-form value, but only permit the
      // controlled list when a user supplies a different value.
      if (
        lexicalData.partOfSpeech !== undefined &&
        lexicalData.partOfSpeech !== null &&
        lexicalData.partOfSpeech !== existingCard.partOfSpeech &&
        !isSupportedPartOfSpeech(lexicalData.partOfSpeech)
      ) {
        throw new CardValidationError("Từ loại không được hỗ trợ.");
      }
      if (
        lexicalData.cefr !== undefined &&
        lexicalData.cefr !== null &&
        lexicalData.cefr !== existingCard.cefr &&
        !CEFR_LEVELS.includes(lexicalData.cefr as (typeof CEFR_LEVELS)[number])
      ) {
        throw new CardValidationError("CEFR phải là A1, A2, B1, B2, C1 hoặc C2.");
      }

      const imageSource =
        lexicalData.imageUrl !== undefined
          ? lexicalData.imageUrl
            ? lexicalData.imageSource || "MANUAL"
            : null
          : lexicalData.imageSource;

      if (lexicalData.imageUrl !== undefined) {
        if (existingCard.imageUrl && existingCard.imageUrl !== lexicalData.imageUrl) {
          cleanupLocalCardImage(existingCard.imageUrl);
        }
      }

      return await db.flashcard.update({
        where: { id: cardId },
        data: {
          ...lexicalData,
          imageSource,
          normalizedTerm: lexicalData.term ? normalizeTerm(lexicalData.term) : undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new ResourceNotFoundError("Không tìm thấy thẻ từ vựng.");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicateFlashcardTermError();
      }
      throw error;
    }
  }

  /**
   * Deletes a card.
   */
  async deleteCard(cardId: string) {
    try {
      const existing = await db.flashcard.findUnique({
        where: { id: cardId },
        select: { imageUrl: true },
      });
      if (existing?.imageUrl) {
        cleanupLocalCardImage(existing.imageUrl);
      }

      return await db.flashcard.delete({
        where: { id: cardId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new ResourceNotFoundError("Không tìm thấy thẻ từ vựng.");
      }
      throw error;
    }
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
   * Shared AI-assisted card creation for a new or existing deck.
   * It is retained for compatibility, but has no primary product entry point.
   */
  async createCardsFromImport(options: {
    deckId?: string;
    deckName?: string;
    folderId?: string;
    items: {
      term: string;
      meaning?: string;
      cefr?: string;
      originalSentence?: string;
    }[];
  }) {
    const { deckId, deckName, folderId, items } = options;

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
        throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");
      }
      targetDeckId = existingDeck.id;
      targetDeckName = existingDeck.name;
    } else {
      const trimmedName = deckName?.trim() || "Từ vựng từ tài liệu";
      if (folderId) {
        const folder = await db.folder.findUnique({ where: { id: folderId }, select: { id: true } });
        if (!folder) throw new ResourceNotFoundError("Không tìm thấy learning collection.");
      }
      const createdDeck = await db.deck.create({
        data: {
          name: trimmedName,
          description: `Được tạo tự động từ tài liệu với ${items.length} từ vựng.`,
          folderId: folderId ?? null,
          position: await this.getNextFolderDeckPosition(db, folderId),
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

    // 2. Fetch images sequentially to deduplicate within the same batch and respect AUTO_IMAGE_MIN_SCORE
    const usedImageUrls = new Set<string>();
    const cardsWithImages: (typeof enrichedCards[number] & {
      imageUrl: string | null;
      imageSource: string | null;
      imageSearchQuery: string | null;
      imagePageUrl: string | null;
      imageAuthor: string | null;
      imageLicense: string | null;
    })[] = [];

    for (const card of enrichedCards) {
      let imageUrl: string | null = null;
      let imageSource: string | null = null;
      let imageSearchQuery: string | null = card.imageSearchQuery;
      let imagePageUrl: string | null = null;
      let imageAuthor: string | null = null;
      let imageLicense: string | null = null;

      const isVisual =
        card.visualScore !== undefined
          ? card.visualScore >= AUTO_IMAGE_MIN_SCORE
          : Boolean(card.imageUseful);
      const shouldSearch = isVisual && Boolean(card.imageSearchQuery);

      if (shouldSearch && card.imageSearchQuery) {
        try {
          const imgResult = await imageSearchService.searchImageForVocabulary(
            card.term,
            card.imageSearchQuery,
            { usedUrls: usedImageUrls }
          );
          if (imgResult.imageUrl && !usedImageUrls.has(imgResult.imageUrl)) {
            imageUrl = imgResult.imageUrl;
            imageSource = "AUTO";
            imageSearchQuery = imgResult.imageSearchQuery;
            imagePageUrl = imgResult.imagePageUrl || null;
            imageAuthor = imgResult.imageAuthor || null;
            imageLicense = imgResult.imageLicense || null;
            usedImageUrls.add(imgResult.imageUrl);
          }
        } catch (err) {
          console.warn(`Failed fetching image for "${card.term}":`, err);
        }
      }

      cardsWithImages.push({
        ...card,
        imageUrl,
        imageSource,
        imageSearchQuery,
        imagePageUrl,
        imageAuthor,
        imageLicense,
      });
    }

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
      imagePageUrl: card.imagePageUrl,
      imageAuthor: card.imageAuthor,
      imageLicense: card.imageLicense,
      status: FlashcardStatus.NEW,
      state: 0,
      due: new Date(),
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

  /** Creates a deck and its user-authored cards without invoking AI or image search. */
  async createManualDeckWithCards(options: {
    deckName?: string;
    folderId?: string;
    cards: ManualFlashcardItem[];
  }) {
    const { deckName, folderId, cards } = options;
    const cardsToCreate = this.getUniqueManualCards(cards);
    if (cardsToCreate.length === 0) {
      throw new Error("Vui lòng nhập ít nhất một thẻ có từ và nghĩa tiếng Việt.");
    }

    if (folderId) {
      const folder = await db.folder.findUnique({ where: { id: folderId }, select: { id: true } });
      if (!folder) throw new ResourceNotFoundError("Không tìm thấy learning collection.");
    }

    const deck = await db.$transaction(async (tx) => {
      const createdDeck = await tx.deck.create({
        data: {
          name: deckName?.trim() || "My Vocabulary",
          description: "Bộ thẻ được tạo thủ công.",
          folderId: folderId ?? null,
          position: await this.getNextFolderDeckPosition(tx, folderId),
        },
      });

      await this.persistManualCards(tx, createdDeck.id, cardsToCreate);
      return createdDeck;
    });

    return this.getDeckById(deck.id);
  }

  /** Adds user-authored cards to an existing deck without invoking AI or image search. */
  async createManualCards(deckId: string, cards: ManualFlashcardItem[]) {
    const cardsToCreate = this.getUniqueManualCards(cards);
    if (cardsToCreate.length === 0) {
      throw new Error("Vui lòng nhập ít nhất một thẻ có từ và nghĩa tiếng Việt.");
    }

    return db.$transaction(async (tx) => {
      const deck = await tx.deck.findUnique({
        where: { id: deckId },
        select: { id: true, name: true },
      });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

      const cardsCreated = await this.persistManualCards(tx, deck.id, cardsToCreate);
      return {
        deckId: deck.id,
        deckName: deck.name,
        cardsCreated,
        ...(cardsCreated === 0
          ? { message: "Tất cả các từ vựng này đã tồn tại trong bộ thẻ." }
          : {}),
      };
    });
  }

  /** Validates a JSON import against the destination deck without changing data. */
  async previewJsonFlashcardImport(deckId: string, rawJson: string) {
    const parsed = parseJsonFlashcardImport(rawJson);
    if (!parsed.valid) {
      return { valid: false, cards: [], errors: parsed.errors };
    }

    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { cards: { select: { normalizedTerm: true } } },
    });
    if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

    const existingTerms = new Set(deck.cards.map((card) => card.normalizedTerm));
    const errors = this.getJsonImportDuplicateErrors(parsed.payload.cards, existingTerms);
    return { valid: errors.length === 0, cards: parsed.payload.cards, errors };
  }

  /**
   * Revalidates and writes an entire JSON import in one database transaction.
   * There is no AI, image search, or partial-success path in this method.
   */
  async importJsonFlashcards(deckId: string, rawJson: string) {
    const parsed = parseJsonFlashcardImport(rawJson);
    if (!parsed.valid) throw new JsonFlashcardImportError(parsed.errors);

    const incomingErrors = this.getJsonImportDuplicateErrors(parsed.payload.cards, new Set());
    if (incomingErrors.length > 0) throw new JsonFlashcardImportError(incomingErrors);

    return db.$transaction(async (tx) => {
      const deck = await tx.deck.findUnique({
        where: { id: deckId },
        select: { id: true, name: true },
      });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

      const existingCards = await tx.flashcard.findMany({
        where: { deckId },
        select: { normalizedTerm: true },
      });
      const existingTerms = new Set(existingCards.map((card) => card.normalizedTerm));
      const duplicateErrors = this.getJsonImportDuplicateErrors(parsed.payload.cards, existingTerms);
      if (duplicateErrors.length > 0) throw new JsonFlashcardImportError(duplicateErrors);

      await tx.flashcard.createMany({
        data: parsed.payload.cards.map((card) => this.toJsonImportCardData(deck.id, card)),
      });

      return { deckId: deck.id, deckName: deck.name, cardsCreated: parsed.payload.cards.length };
    });
  }

  private getUniqueManualCards(cards: ManualFlashcardItem[]): ManualFlashcardItem[] {
    const seenTerms = new Set<string>();

    return cards.filter((card) => {
      const normalizedTerm = normalizeTerm(card.term);
      if (!normalizedTerm || !card.meaningVi.trim() || seenTerms.has(normalizedTerm)) {
        return false;
      }
      seenTerms.add(normalizedTerm);
      return true;
    });
  }

  private getJsonImportDuplicateErrors(cards: JsonFlashcard[], existingTerms: Set<string>): string[] {
    const seenTerms = new Map<string, number>();
    const errors: string[] = [];

    cards.forEach((card, index) => {
      const normalizedTerm = normalizeTerm(card.term);
      const firstIndex = seenTerms.get(normalizedTerm);
      if (firstIndex !== undefined) {
        errors.push(`cards[${index}].term: Duplicate of cards[${firstIndex}].term.`);
        return;
      }
      seenTerms.set(normalizedTerm, index);
      if (existingTerms.has(normalizedTerm)) {
        errors.push(`cards[${index}].term: This term already exists in the destination deck.`);
      }
    });

    return errors;
  }

  private toJsonImportCardData(deckId: string, card: JsonFlashcard): Prisma.FlashcardCreateManyInput {
    return {
      deckId,
      term: card.term,
      normalizedTerm: normalizeTerm(card.term),
      meaningVi: card.meaningVi,
      definitionEn: card.definitionEn ?? null,
      ipa: card.ipa ?? null,
      partOfSpeech: card.partOfSpeech ?? null,
      cefr: card.cefr ?? null,
      exampleEn: card.exampleEn ?? null,
      exampleVi: card.exampleVi ?? null,
      imageUrl: card.imageUrl ?? null,
      imageSource: card.imageUrl ? "MANUAL" : null,
      imageSearchQuery: null,
      imagePageUrl: null,
      imageAuthor: null,
      imageLicense: null,
      status: FlashcardStatus.NEW,
      state: 0,
      due: new Date(),
    };
  }

  private async persistManualCards(
    tx: Prisma.TransactionClient,
    deckId: string,
    cards: ManualFlashcardItem[]
  ): Promise<number> {
    const existingCards = await tx.flashcard.findMany({
      where: { deckId },
      select: { normalizedTerm: true },
    });
    const existingTerms = new Set(existingCards.map((card) => card.normalizedTerm));
    const uniqueCards = cards.filter((card) => !existingTerms.has(normalizeTerm(card.term)));

    if (uniqueCards.length === 0) return 0;

    await tx.flashcard.createMany({
      data: uniqueCards.map((card) => ({
        deckId,
        term: card.term,
        normalizedTerm: normalizeTerm(card.term),
        meaningVi: card.meaningVi,
        definitionEn: card.definitionEn ?? null,
        ipa: card.ipa ?? null,
        partOfSpeech: card.partOfSpeech ?? null,
        cefr: card.cefr ?? null,
        exampleEn: card.exampleEn ?? null,
        exampleVi: card.exampleVi ?? null,
        imageUrl: card.imageUrl ?? null,
        imageSource: card.imageUrl ? "MANUAL" : null,
        imageSearchQuery: null,
        imagePageUrl: null,
        imageAuthor: null,
        imageLicense: null,
        status: FlashcardStatus.NEW,
        state: 0,
        due: new Date(),
      })),
    });

    return uniqueCards.length;
  }

  private async getNextFolderDeckPosition(
    client: Pick<typeof db, "deck">,
    folderId?: string
  ): Promise<number> {
    if (!folderId) return 0;
    const lastDeck = await client.deck.findFirst({
      where: { folderId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return (lastDeck?.position ?? -1) + 1;
  }
}

export const deckService = new DeckService();
