import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { normalizeTerm, parseVocabularyInput } from "./parser";
import { aiService } from "@/services/ai";
import { FlashcardStatus, Prisma } from "@prisma/client";
import {
  AI_CARD_GENERATION_LIMIT,
  CEFR_LEVELS,
  isSupportedPartOfSpeech,
  ManualFlashcardItem,
  UpdateFlashcardRequest,
} from "@/lib/validation/flashcard";
import type { CreateDeckInput } from "@/lib/validation/folder";
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
  /** Creates an empty destination for learner-authored flashcards. */
  async createDeck(input: CreateDeckInput) {
    const folderId = input.folderId ?? null;
    if (folderId) {
      const folder = await db.folder.findUnique({ where: { id: folderId }, select: { id: true } });
      if (!folder) throw new ResourceNotFoundError("Không tìm thấy bộ sưu tập.");
    }

    return db.deck.create({
      data: {
        name: input.name.trim(),
        description: input.description ?? null,
        folderId,
        position: await this.getNextFolderDeckPosition(db, folderId ?? undefined),
      },
    });
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

  /**
   * Commits an accepted AI preview as one strict transaction. Unlike manual
   * entry, a stale preview is rejected as a whole instead of quietly adding
   * only a subset after another tab has created a duplicate.
   */
  async persistAiCardDrafts(deckId: string, cards: ManualFlashcardItem[]) {
    const uniqueCards = this.getUniqueManualCards(cards);
    if (uniqueCards.length !== cards.length) {
      throw new CardValidationError("Bản xem trước có thẻ trùng hoặc thiếu nội dung. Hãy tạo lại.");
    }

    return db.$transaction(async (tx) => {
      const deck = await tx.deck.findUnique({
        where: { id: deckId },
        select: { id: true, name: true, cards: { select: { normalizedTerm: true } } },
      });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

      const existingTerms = new Set(deck.cards.map((card) => card.normalizedTerm));
      if (uniqueCards.some((card) => existingTerms.has(normalizeTerm(card.term)))) {
        throw new CardValidationError("Một thẻ trong bản xem trước đã có trong bộ từ. Hãy tạo lại.");
      }

      const cardsCreated = await this.persistManualCards(tx, deck.id, uniqueCards);
      if (cardsCreated !== uniqueCards.length) {
        throw new CardValidationError("Không thể lưu trọn vẹn bản xem trước. Hãy tạo lại.");
      }
      return { deckId: deck.id, deckName: deck.name, cardsCreated };
    });
  }

  /**
   * Generates a reviewable lexical draft for an existing deck. This does not
   * write Flashcards, does not search images, and is safe to retry.
   */
  async generateAiCardDrafts(deckId: string, rawInput: string) {
    const parsed = parseVocabularyInput(rawInput, AI_CARD_GENERATION_LIMIT);
    if (parsed.error) throw new CardValidationError(parsed.error);
    if (parsed.terms.length === 0) {
      throw new CardValidationError("Nhập ít nhất một từ hoặc cụm từ.");
    }

    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { id: true, cards: { select: { normalizedTerm: true } } },
    });
    if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

    const existingTerms = new Set(deck.cards.map((card) => card.normalizedTerm));
    const termsToGenerate = parsed.terms.filter((term) => !existingTerms.has(normalizeTerm(term)));
    const skippedExistingTerms = parsed.terms.filter((term) => existingTerms.has(normalizeTerm(term)));

    if (termsToGenerate.length === 0) {
      throw new CardValidationError("Các từ này đã có trong bộ từ.");
    }

    const generated = await aiService.generateFlashcards(termsToGenerate);
    if (generated.length !== termsToGenerate.length) {
      throw new CardValidationError("AI trả về thiếu thẻ. Hãy thử lại.");
    }

    const cards: ManualFlashcardItem[] = generated.map((card, index) => ({
      term: termsToGenerate[index],
      meaningVi: card.meaningVi,
      definitionEn: card.definitionEn,
      ipa: card.ipa ?? undefined,
      partOfSpeech:
        card.partOfSpeech && isSupportedPartOfSpeech(card.partOfSpeech)
          ? card.partOfSpeech
          : undefined,
      cefr: card.cefr ?? undefined,
      exampleEn: card.exampleEn,
      exampleVi: card.exampleVi,
    }));

    return {
      cards,
      skippedExistingTerms,
      duplicateInputCount: parsed.duplicateCount,
    };
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
