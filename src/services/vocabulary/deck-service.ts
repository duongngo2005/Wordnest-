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

export interface SkippedDuplicateCard {
  term: string;
  normalizedTerm: string;
  reason: string;
  existingDeckId?: string;
  existingDeckName?: string;
  existingFolderName?: string;
}

export class DuplicateFlashcardTermError extends Error {
  constructor(message = "Thuật ngữ này đã có trong bộ thẻ. Hãy chọn một thuật ngữ khác.") {
    super(message);
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
        select: { deckId: true, partOfSpeech: true, cefr: true, imageUrl: true },
      });
      if (!existingCard) throw new ResourceNotFoundError("Không tìm thấy thẻ từ vựng.");

      // Check system-wide uniqueness when term is updated
      if (lexicalData.term) {
        const normalized = normalizeTerm(lexicalData.term);
        const duplicate = await db.flashcard.findFirst({
          where: {
            normalizedTerm: normalized,
            id: { not: cardId },
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
        if (duplicate) {
          const isSameDeck = duplicate.deckId === existingCard.deckId;
          const location = isSameDeck
            ? "bộ thẻ này"
            : `bộ thẻ "${duplicate.deck.name}"${duplicate.deck.folder ? ` (bộ sưu tập "${duplicate.deck.folder.name}")` : ""}`;
          throw new DuplicateFlashcardTermError(
            `Thuật ngữ "${lexicalData.term}" đã tồn tại trong ${location}. Hãy chọn một thuật ngữ khác.`
          );
        }
      }

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
      if (error instanceof DuplicateFlashcardTermError) {
        throw error;
      }
      if (error instanceof CardValidationError) {
        throw error;
      }
      if (error instanceof ResourceNotFoundError) {
        throw error;
      }
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
    const validCards = cards.filter((card) => card.term.trim() && card.meaningVi.trim());
    if (validCards.length === 0) {
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

      await this.persistManualCards(tx, createdDeck.id, validCards);
      return createdDeck;
    });

    return this.getDeckById(deck.id);
  }

  /** Adds user-authored cards to an existing deck without invoking AI or image search. */
  async createManualCards(deckId: string, cards: ManualFlashcardItem[]) {
    const validCards = cards.filter((card) => card.term.trim() && card.meaningVi.trim());
    if (validCards.length === 0) {
      throw new Error("Vui lòng nhập ít nhất một thẻ có từ và nghĩa tiếng Việt.");
    }

    return db.$transaction(async (tx) => {
      const deck = await tx.deck.findUnique({
        where: { id: deckId },
        select: { id: true, name: true },
      });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

      const result = await this.persistManualCards(tx, deck.id, validCards);
      return {
        deckId: deck.id,
        deckName: deck.name,
        cardsCreated: result.cardsCreated,
        skippedDuplicates: result.skippedDuplicates,
        ...(result.cardsCreated === 0 && result.skippedDuplicates.length > 0
          ? { message: result.skippedDuplicates[0].reason }
          : {}),
      };
    });
  }

  /**
   * Commits accepted AI card drafts, skipping any system-wide duplicate terms gracefully.
   */
  async persistAiCardDrafts(deckId: string, cards: ManualFlashcardItem[]) {
    if (cards.length > AI_CARD_GENERATION_LIMIT) {
      throw new CardValidationError(
        `Bạn có thể tạo tối đa ${AI_CARD_GENERATION_LIMIT} flashcard trong mỗi lần.`
      );
    }

    const validCards = cards.filter((card) => card.term.trim() && card.meaningVi.trim());
    if (validCards.length === 0) {
      throw new CardValidationError("Bản xem trước không có thẻ hợp lệ. Hãy tạo lại.");
    }

    return db.$transaction(async (tx) => {
      const deck = await tx.deck.findUnique({
        where: { id: deckId },
        select: { id: true, name: true },
      });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

      const result = await this.persistManualCards(tx, deck.id, validCards);
      return {
        deckId: deck.id,
        deckName: deck.name,
        cardsCreated: result.cardsCreated,
        skippedDuplicates: result.skippedDuplicates,
      };
    });
  }

  /**
   * Generates a reviewable lexical draft for an existing deck. This does not
   * write Flashcards, does not search images, and checks system-wide uniqueness.
   */
  async generateAiCardDrafts(deckId: string, rawInput: string) {
    const parsed = parseVocabularyInput(rawInput, AI_CARD_GENERATION_LIMIT);
    if (parsed.error) throw new CardValidationError(parsed.error);
    if (parsed.terms.length > AI_CARD_GENERATION_LIMIT) {
      throw new CardValidationError(
        `Đã nhận ${parsed.terms.length} từ. Vui lòng chọn tối đa ${AI_CARD_GENERATION_LIMIT} từ để tạo flashcard.`
      );
    }
    if (parsed.terms.length === 0) {
      throw new CardValidationError("Nhập ít nhất một từ hoặc cụm từ.");
    }

    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

    const candidateTerms = parsed.terms.map(normalizeTerm).filter(Boolean);
    const existingSystemMap = await this.findSystemDuplicates(db, candidateTerms);

    const termsToGenerate: string[] = [];
    const skippedDuplicates: SkippedDuplicateCard[] = [];

    for (const term of parsed.terms) {
      const normalized = normalizeTerm(term);
      const existing = existingSystemMap.get(normalized);
      if (existing) {
        const isSameDeck = existing.deckId === deckId;
        const locationInfo = isSameDeck
          ? "trong bộ thẻ này"
          : `trong bộ thẻ "${existing.deckName}"${existing.folderName ? ` (bộ sưu tập "${existing.folderName}")` : ""}`;
        skippedDuplicates.push({
          term,
          normalizedTerm: normalized,
          reason: `Đã tồn tại ${locationInfo}.`,
          existingDeckId: existing.deckId,
          existingDeckName: existing.deckName,
          existingFolderName: existing.folderName ?? undefined,
        });
      } else {
        termsToGenerate.push(term);
      }
    }

    if (termsToGenerate.length === 0) {
      const sampleReasons = skippedDuplicates.slice(0, 2).map((s) => `"${s.term}": ${s.reason}`).join("; ");
      throw new CardValidationError(`Tất cả các từ này đã có trong hệ thống (${sampleReasons}).`);
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
      skippedExistingTerms: skippedDuplicates.map((s) => s.term),
      skippedDuplicates,
      duplicateInputCount: parsed.duplicateCount,
    };
  }

  /** Validates a JSON import against the destination deck and entire system without changing data. */
  async previewJsonFlashcardImport(deckId: string, rawJson: string) {
    const parsed = parseJsonFlashcardImport(rawJson);
    if (!parsed.valid) {
      return { valid: false, cards: [], skippedCards: [], errors: parsed.errors };
    }

    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

    const candidateTerms = parsed.payload.cards.map((c) => normalizeTerm(c.term)).filter(Boolean);
    const existingSystemMap = await this.findSystemDuplicates(db, candidateTerms);
    const { uniqueCards, skippedDuplicates } = this.partitionCardsBySystemDuplicates(
      parsed.payload.cards,
      deckId,
      existingSystemMap
    );

    return {
      valid: true,
      cards: uniqueCards,
      skippedCards: skippedDuplicates,
      errors: [],
    };
  }

  /**
   * Revalidates and writes non-duplicate JSON flashcards in one database transaction.
   * Duplicate words are skipped gracefully with friendly logs/reasons without aborting the import.
   */
  async importJsonFlashcards(deckId: string, rawJson: string) {
    const parsed = parseJsonFlashcardImport(rawJson);
    if (!parsed.valid) throw new JsonFlashcardImportError(parsed.errors);

    return db.$transaction(async (tx) => {
      const deck = await tx.deck.findUnique({
        where: { id: deckId },
        select: { id: true, name: true },
      });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

      const candidateTerms = parsed.payload.cards.map((c) => normalizeTerm(c.term)).filter(Boolean);
      const existingSystemMap = await this.findSystemDuplicates(tx, candidateTerms);
      const { uniqueCards, skippedDuplicates } = this.partitionCardsBySystemDuplicates(
        parsed.payload.cards,
        deckId,
        existingSystemMap
      );

      if (uniqueCards.length > 0) {
        await tx.flashcard.createMany({
          data: uniqueCards.map((card) => this.toJsonImportCardData(deck.id, card)),
        });
      }

      return {
        deckId: deck.id,
        deckName: deck.name,
        cardsCreated: uniqueCards.length,
        skippedDuplicates,
      };
    });
  }

  /**
   * Finds existing cards across the entire database matching the given normalized terms.
   */
  private async findSystemDuplicates(
    tx: Prisma.TransactionClient | typeof db,
    candidateNormalizedTerms: string[]
  ): Promise<Map<string, { deckId: string; deckName: string; folderName: string | null }>> {
    if (candidateNormalizedTerms.length === 0) return new Map();

    const matches = await tx.flashcard.findMany({
      where: {
        normalizedTerm: { in: candidateNormalizedTerms },
      },
      select: {
        normalizedTerm: true,
        deckId: true,
        deck: {
          select: {
            name: true,
            folder: { select: { name: true } },
          },
        },
      },
    });

    const map = new Map<string, { deckId: string; deckName: string; folderName: string | null }>();
    for (const match of matches) {
      if (!map.has(match.normalizedTerm)) {
        map.set(match.normalizedTerm, {
          deckId: match.deckId,
          deckName: match.deck.name,
          folderName: match.deck.folder?.name ?? null,
        });
      }
    }
    return map;
  }

  /**
   * Partitions candidate cards into unique (to be created) and skipped duplicates (already exist
   * either in the same batch or anywhere in the system database).
   */
  private partitionCardsBySystemDuplicates<T extends { term: string }>(
    cards: T[],
    targetDeckId: string,
    existingInSystem: Map<string, { deckId: string; deckName: string; folderName: string | null }>
  ): { uniqueCards: T[]; skippedDuplicates: SkippedDuplicateCard[] } {
    const seenInBatch = new Set<string>();
    const uniqueCards: T[] = [];
    const skippedDuplicates: SkippedDuplicateCard[] = [];

    for (const card of cards) {
      const normalized = normalizeTerm(card.term);
      if (!normalized) continue;

      if (seenInBatch.has(normalized)) {
        skippedDuplicates.push({
          term: card.term,
          normalizedTerm: normalized,
          reason: "Trùng lặp với từ khác trong danh sách đang nhập.",
        });
        continue;
      }
      seenInBatch.add(normalized);

      const existing = existingInSystem.get(normalized);
      if (existing) {
        const isSameDeck = existing.deckId === targetDeckId;
        const locationInfo = isSameDeck
          ? "trong bộ thẻ này"
          : `trong bộ thẻ "${existing.deckName}"${existing.folderName ? ` (bộ sưu tập "${existing.folderName}")` : ""}`;

        skippedDuplicates.push({
          term: card.term,
          normalizedTerm: normalized,
          reason: `Đã tồn tại ${locationInfo}.`,
          existingDeckId: existing.deckId,
          existingDeckName: existing.deckName,
          existingFolderName: existing.folderName ?? undefined,
        });
        continue;
      }

      uniqueCards.push(card);
    }

    return { uniqueCards, skippedDuplicates };
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
  ): Promise<{ cardsCreated: number; skippedDuplicates: SkippedDuplicateCard[] }> {
    const candidateTerms = cards.map((card) => normalizeTerm(card.term)).filter(Boolean);
    const existingSystemMap = await this.findSystemDuplicates(tx, candidateTerms);
    const { uniqueCards, skippedDuplicates } = this.partitionCardsBySystemDuplicates(
      cards,
      deckId,
      existingSystemMap
    );

    if (uniqueCards.length === 0) {
      return { cardsCreated: 0, skippedDuplicates };
    }

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

    return { cardsCreated: uniqueCards.length, skippedDuplicates };
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
