import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { normalizeTerm } from "./parser";
import { FlashcardStatus, Prisma } from "@prisma/client";
import {
  CEFR_LEVELS,
  isSupportedPartOfSpeech,
  ManualFlashcardItem,
  ManualFlashcardStudyCommitRequest,
  UpdateFlashcardRequest,
} from "@/lib/validation/flashcard";
import type { CreateDeckInput } from "@/lib/validation/folder";
import {
  JsonFlashcard,
  ExternalAiV3Manifest,
  ExternalAiV3ImportReview,
  ExternalAiV3ManifestComparison,
  externalAiV3ImportReviewSchema,
  parseExternalAiV3Import,
  parseJsonFlashcardImport,
} from "@/lib/flashcards/json-import";
import {
  describeExistingVocabularyLocation,
  findExistingVocabularyIdentities,
  isGlobalVocabularyDuplicateError,
  type ExistingVocabularyCandidate,
  type ExistingVocabularyIdentity,
} from "./global-vocabulary-identity";
import {
  assertDeletionPreviewIsCurrent,
  createDeletionPreviewFingerprint,
} from "./deletion-preview";

export { StaleDeletionPreviewError } from "./deletion-preview";

export class JsonFlashcardImportError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors[0] || "Dữ liệu JSON flashcard không hợp lệ.");
    this.name = "JsonFlashcardImportError";
  }
}

/** The reviewed identity or content changed before an External AI V3 commit. */
export class StaleJsonFlashcardImportPreviewError extends Error {
  constructor(message = "Dữ liệu từ vựng đã thay đổi sau khi xem trước. Hãy kiểm tra lại trước khi nhập.") {
    super(message);
    this.name = "StaleJsonFlashcardImportPreviewError";
  }
}

/** The learner's duplicate review is no longer current at commit time. */
export class StaleManualFlashcardDuplicatePreviewError extends Error {
  constructor(message = "Thẻ đã thay đổi sau khi kiểm tra trùng. Hãy kiểm tra lại trước khi lưu.") {
    super(message);
    this.name = "StaleManualFlashcardDuplicatePreviewError";
  }
}

export interface SkippedDuplicateCard {
  term: string;
  normalizedTerm: string;
  reason: string;
  status?: "EXISTING_NOT_LINKED" | "EXISTING_ALREADY_LINKED" | "CONTENT_CONFLICT" | "AMBIGUOUS_LEGACY_IDENTITY" | "DUPLICATE_WITHIN_IMPORT";
  existingCardId?: string;
  existingDeckId?: string;
  existingDeckName?: string;
  existingFolderName?: string;
  existingLocations?: Array<{
    cardId: string;
    deckId: string;
    deckName: string;
    folderName?: string;
  }>;
  contentConflictFields?: string[];
  /** A single safely identifiable canonical card for side-by-side review. */
  existingCard?: ExistingVocabularyCandidate;
  /** All candidates are exposed only for historical-ambiguity review. */
  existingCandidates?: ExistingVocabularyCandidate[];
  /** Nullable incoming optional fields have already been resolved safely. */
  effectiveIncomingCard?: { term: string } & Partial<JsonFlashcard>;
  requiresIndividualOverwriteConfirmation?: boolean;
}

export class DuplicateFlashcardTermError extends Error {
  constructor(message = "Thuật ngữ này đã tồn tại trong WordNest. Mỗi term chỉ có một hồ sơ từ vựng toàn cục.") {
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

export interface ManualFlashcardDuplicatePreview {
  classification: "new" | "existing" | "ambiguous";
  incomingFingerprint: string;
  existingCard?: ExistingVocabularyCandidate;
  existingCandidates?: ExistingVocabularyCandidate[];
  changedFields: string[];
  reason?: string;
}

type ManualFlashcardStudyDecision = ManualFlashcardStudyCommitRequest["decision"];

export interface DeckDeletionImpact {
  /** Server-calculated snapshot that must be echoed on the destructive request. */
  fingerprint: string;
  /** Memberships that will be removed with the organizational source. */
  flashcards: number;
  /** Canonical cards that retain another source membership. */
  sharedFlashcards: number;
  /** Canonical cards that remain in WordNest without a Deck after deletion. */
  unassignedFlashcards: number;
  /** Always zero for a routine source deletion. */
  canonicalFlashcardsDeleted: number;
  /** Always zero for a routine source deletion. */
  learningHistoriesDeleted: number;
  /** Affected history is reported for transparency and is retained. */
  reviewLogs: number;
  practiceAttempts: number;
  /** Deck-owned artifacts are retained with deckId set to null. */
  stories: number;
  lessons: number;
  quizAttempts: number;
  quizSessions: number;
}

/**
 * Retained for API compatibility with pre-V1.3 clients. Source deletion is no
 * longer blocked after the retention migration; callers receive an impact
 * preview and can explicitly confirm the safe organizational operation.
 */
export class DeckDeletionBlockedError extends Error {
  constructor(public readonly impact: DeckDeletionImpact) {
    super(
      `Không thể xóa bộ từ vì còn ${impact.flashcards} thẻ, ${impact.reviewLogs} lượt ôn và ${impact.practiceAttempts} lượt luyện tập. ` +
        "WordNest đã chặn thao tác này để bảo vệ dữ liệu học."
    );
    this.name = "DeckDeletionBlockedError";
  }
}

type JsonImportMode = "legacy" | "external-ai-v3";

interface JsonFlashcardImportOptions {
  mode?: JsonImportMode;
  manifest?: ExternalAiV3Manifest;
  /** Explicit approvals to associate canonical cards with this source Deck. */
  linkExistingCardIds?: string[];
  /** V3-only optimistic-concurrency snapshot and content-only overwrite choices. */
  review?: ExternalAiV3ImportReview;
}

export interface JsonFlashcardPreviewResult {
  valid: boolean;
  cards: JsonFlashcard[];
  newCards: JsonFlashcard[];
  skippedCards: SkippedDuplicateCard[];
  existingCards?: SkippedDuplicateCard[];
  errors: string[];
  mode: JsonImportMode;
  manifest?: ExternalAiV3ManifestComparison;
  reviewSnapshots?: ExternalAiV3ImportReview["snapshots"];
}

export class AmbiguousVocabularyIdentityError extends Error {
  constructor() {
    super("Định danh từ vựng này có nhiều bản ghi lịch sử chưa được đối soát. WordNest không thể tự chọn bản ghi để liên kết.");
    this.name = "AmbiguousVocabularyIdentityError";
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
        vocabularyMemberships: {
          orderBy: { createdAt: "asc" },
          include: {
            flashcard: {
              include: {
                deckMemberships: {
                  orderBy: { createdAt: "asc" },
                  include: { deck: { select: { id: true, name: true, folder: { select: { name: true } } } } },
                },
              },
            },
          },
        },
        folder: { select: { name: true } },
      },
    });

    if (!deck) {
      return null;
    }

    const cards = deck.vocabularyMemberships.map(({ flashcard }) => {
      const { deckMemberships, ...card } = flashcard;
      return {
        ...card,
        sources: deckMemberships.map((membership) => ({
          deckId: membership.deck.id,
          deckName: membership.deck.name,
          folderName: membership.deck.folder?.name ?? null,
        })),
      };
    });
    let newCount = 0;
    let learningCount = 0;
    let knownCount = 0;

    for (const card of cards) {
      if (card.status === FlashcardStatus.NEW) newCount++;
      else if (card.status === FlashcardStatus.LEARNING) learningCount++;
      else if (card.status === FlashcardStatus.KNOWN) knownCount++;
    }

    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      folderId: deck.folderId,
      folder: deck.folder,
      position: deck.position,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      cards,
      stats: {
        totalCards: cards.length,
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
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: {
        id: true,
        name: true,
        _count: { select: { vocabularyMemberships: true } },
      },
    });
    if (!deck) return null;
    return {
      id: deck.id,
      name: deck.name,
      _count: { cards: deck._count.vocabularyMemberships },
    };
  }

  /**
   * Minimal data required to create a story from a deck.
   */
  async getDeckStoryData(deckId: string) {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: {
        id: true,
        name: true,
        vocabularyMemberships: {
          orderBy: { createdAt: "asc" },
          select: { flashcard: { select: { term: true } } },
        },
      },
    });
    if (!deck) return null;
    return {
      id: deck.id,
      name: deck.name,
      cards: deck.vocabularyMemberships.map((membership) => membership.flashcard),
    };
  }

  /** Static lexical fields for target words only, suitable for the Story popup. */
  async getStoryFlashcards(deckId: string, terms: string[]) {
    const normalizedTerms = [...new Set(terms.map(normalizeTerm).filter(Boolean))];
    if (normalizedTerms.length === 0) return [];

    return db.flashcard.findMany({
      where: {
        deckMemberships: { some: { deckId } },
        normalizedTerm: { in: normalizedTerms },
      },
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
        vocabularyMemberships: {
          select: { flashcard: { select: { status: true } } },
        },
      },
    });

    return decks.map((deck) => {
      let newCount = 0;
      let learningCount = 0;
      let knownCount = 0;

      const cards = deck.vocabularyMemberships.map((membership) => membership.flashcard);
      for (const card of cards) {
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
        totalCards: cards.length,
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

      // Vocabulary identity is global. A deck organizes source material; it
      // never permits a second independent learning record for the same term.
      if (lexicalData.term) {
        const normalized = normalizeTerm(lexicalData.term);
        const existing = (await findExistingVocabularyIdentities(db, [normalized])).get(normalized);
        const duplicateLocations = existing?.locations.filter((location) => location.cardId !== cardId) ?? [];
        if (duplicateLocations.length > 0) {
          const duplicate = { ...existing!, locations: duplicateLocations };
          throw new DuplicateFlashcardTermError(
            `Thuật ngữ "${lexicalData.term}" đã tồn tại trong ${describeExistingVocabularyLocation(duplicate)}. Mỗi term chỉ có một hồ sơ từ vựng toàn cục.`
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
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003"].includes(error.code)) ||
        isGlobalVocabularyDuplicateError(error)
      ) {
        throw new DuplicateFlashcardTermError();
      }
      throw error;
    }
  }

  /**
   * Removes a canonical card from one source Deck only. Global vocabulary
   * deletion is deliberately not exposed through this routine because it
   * would require an explicit history-retention policy.
   */
  async removeCardFromDeck(cardId: string, deckId: string) {
    try {
      return await db.deckVocabularyMembership.delete({
        where: { deckId_flashcardId: { deckId, flashcardId: cardId } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new ResourceNotFoundError("Không tìm thấy liên kết từ vựng trong bộ thẻ này.");
      }
      throw error;
    }
  }

  /**
   * Removes a Deck source without deleting its Flashcards or learning history.
   * SQLite cascades only its membership rows. Flashcards, learning history and
   * deck-owned artifacts remain, with the latter becoming unassigned.
   */
  async deleteDeck(deckId: string, expectedImpactFingerprint?: string) {
    return db.$transaction(async (tx) => {
      const impact = await this.getDeckDeletionImpactInTransaction(tx, deckId);
      assertDeletionPreviewIsCurrent(expectedImpactFingerprint, impact.fingerprint);
      return tx.deck.delete({ where: { id: deckId } });
    });
  }

  async getDeckDeletionImpact(
    deckId: string
  ): Promise<DeckDeletionImpact> {
    return db.$transaction((tx) => this.getDeckDeletionImpactInTransaction(tx, deckId));
  }

  private async getDeckDeletionImpactInTransaction(
    tx: Prisma.TransactionClient,
    deckId: string
  ): Promise<DeckDeletionImpact> {
    const deck = await tx.deck.findUnique({
      where: { id: deckId },
      select: {
        id: true,
        updatedAt: true,
        stories: { select: { id: true, updatedAt: true }, orderBy: { id: "asc" } },
        lessons: { select: { id: true, updatedAt: true }, orderBy: { id: "asc" } },
        quizAttempts: { select: { id: true, createdAt: true }, orderBy: { id: "asc" } },
        quizSessions: { select: { id: true, createdAt: true, expiresAt: true }, orderBy: { id: "asc" } },
      },
    });
    if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ.");

    const memberships = await tx.deckVocabularyMembership.findMany({
      where: { deckId },
      select: { id: true, flashcardId: true, createdAt: true },
      orderBy: { id: "asc" },
    });
    const cardIds = memberships.map((membership) => membership.flashcardId);
    const cards = cardIds.length > 0
      ? await tx.flashcard.findMany({
          where: { id: { in: cardIds } },
          select: {
            id: true,
            deckMemberships: {
              select: { id: true, deckId: true, createdAt: true },
              orderBy: { id: "asc" },
            },
          },
          orderBy: { id: "asc" },
        })
      : [];
    const sharedFlashcards = cards.filter((card) => card.deckMemberships.some((membership) => membership.deckId !== deckId)).length;
    const unassignedFlashcards = cards.filter((card) => card.deckMemberships.length === 1).length;

    const [reviewLogs, practiceAttempts] = await Promise.all([
      cardIds.length > 0
        ? tx.reviewLog.findMany({
            where: { cardId: { in: cardIds } },
            select: { id: true, cardId: true, createdAt: true },
            orderBy: { id: "asc" },
          })
        : [],
      cardIds.length > 0
        ? tx.practiceAttempt.findMany({
            where: { flashcardId: { in: cardIds } },
            select: { id: true, flashcardId: true, createdAt: true },
            orderBy: { id: "asc" },
          })
        : [],
    ]);

    const fingerprint = createDeletionPreviewFingerprint({
      deck: { id: deck.id, updatedAt: deck.updatedAt },
      memberships,
      cards: cards.map((card) => ({ id: card.id, memberships: card.deckMemberships })),
      reviewLogs,
      practiceAttempts,
      stories: deck.stories,
      lessons: deck.lessons,
      quizAttempts: deck.quizAttempts,
      quizSessions: deck.quizSessions,
    });

    return {
      fingerprint,
      flashcards: memberships.length,
      sharedFlashcards,
      unassignedFlashcards,
      canonicalFlashcardsDeleted: 0,
      learningHistoriesDeleted: 0,
      reviewLogs: reviewLogs.length,
      practiceAttempts: practiceAttempts.length,
      stories: deck.stories.length,
      lessons: deck.lessons.length,
      quizAttempts: deck.quizAttempts.length,
      quizSessions: deck.quizSessions.length,
    };
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
   * Checks a learner-authored card against the global vocabulary identity
   * before the study UI offers a destructive lexical overwrite.
   */
  async previewManualFlashcardDuplicate(
    deckId: string,
    card: ManualFlashcardItem
  ): Promise<ManualFlashcardDuplicatePreview> {
    const deck = await db.deck.findUnique({ where: { id: deckId }, select: { id: true } });
    if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

    return this.buildManualFlashcardDuplicatePreview(db, card);
  }

  /**
   * Writes the exact card version the learner reviewed. New cards create one
   * canonical record; duplicates can only update lexical fields in place.
   */
  async commitManualFlashcardFromStudy(
    deckId: string,
    card: ManualFlashcardItem,
    decision: ManualFlashcardStudyDecision
  ) {
    return db.$transaction(async (tx) => {
      const deck = await tx.deck.findUnique({ where: { id: deckId }, select: { id: true } });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

      const preview = await this.buildManualFlashcardDuplicatePreview(tx, card);
      if (preview.incomingFingerprint !== decision.incomingFingerprint) {
        throw new StaleManualFlashcardDuplicatePreviewError();
      }

      if (preview.classification === "new") {
        if (decision.action !== "create") throw new StaleManualFlashcardDuplicatePreviewError();
        const result = await this.persistManualCards(tx, deck.id, [card]);
        if (result.cardsCreated !== 1 || result.skippedDuplicates.length > 0) {
          throw new StaleManualFlashcardDuplicatePreviewError();
        }
        return { action: "created" as const };
      }

      if (preview.classification !== "existing" || !preview.existingCard) {
        throw new StaleManualFlashcardDuplicatePreviewError(
          "Có nhiều thẻ lịch sử cho từ này. WordNest không thể tự chọn thẻ để ghi đè."
        );
      }
      if (
        decision.action !== "overwrite" ||
        decision.existingCardId !== preview.existingCard.id ||
        decision.contentVersion !== preview.existingCard.contentVersion
      ) {
        throw new StaleManualFlashcardDuplicatePreviewError();
      }

      const updatedCard = await tx.flashcard.update({
        where: { id: preview.existingCard.id },
        data: this.toManualStudyContentUpdate(card),
      });
      return { action: "overwritten" as const, card: updatedCard };
    });
  }

  /**
   * Validates JSON without mutating cards. Legacy JSON retains its permissive
   * behavior; External AI V3 additionally verifies the transient client-side
   * prompt manifest and never removes a mismatched card from the preview.
   */
  async previewJsonFlashcardImport(
    deckId: string,
    rawJson: string,
    options: JsonFlashcardImportOptions = {}
  ): Promise<JsonFlashcardPreviewResult> {
    const mode = options.mode ?? "legacy";
    if (mode === "external-ai-v3") {
      if (!options.manifest) {
        return {
          valid: false, cards: [], newCards: [], skippedCards: [], errors: ["External AI V3 cần danh sách term gốc để kiểm tra kết quả."], mode,
        };
      }
      const parsed = parseExternalAiV3Import(rawJson, options.manifest);
      if (!parsed.valid) {
        return {
          valid: false,
          cards: parsed.recoverableCards ?? [],
          newCards: [],
          skippedCards: [],
          errors: parsed.errors,
          mode,
          manifest: parsed.comparison,
        };
      }

      const deck = await db.deck.findUnique({ where: { id: deckId }, select: { id: true } });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

      const candidateTerms = parsed.payload.cards.map((card) => normalizeTerm(card.term)).filter(Boolean);
      const existingVocabularyMap = await this.findGlobalDuplicates(db, candidateTerms);
      const { uniqueCards, skippedDuplicates } = this.partitionCardsByGlobalDuplicates(
        parsed.payload.cards,
        existingVocabularyMap,
        deck.id
      );
      // Historical ambiguity can have no active Deck membership. It still
      // belongs in the explicit duplicate-review area rather than being
      // mistaken for an in-batch duplicate and silently hidden.
      const existingCards = skippedDuplicates.filter((card) => card.status !== "DUPLICATE_WITHIN_IMPORT");
      const duplicateInputCards = skippedDuplicates.filter((card) => card.status === "DUPLICATE_WITHIN_IMPORT");

      return {
        valid: true,
        cards: parsed.payload.cards,
        newCards: uniqueCards,
        skippedCards: duplicateInputCards,
        existingCards,
        errors: [],
        mode,
        manifest: parsed.comparison,
        reviewSnapshots: this.createExternalAiV3ReviewSnapshots(parsed.payload.cards, existingVocabularyMap),
      };
    }

    const parsed = parseJsonFlashcardImport(rawJson);
    if (!parsed.valid) {
      return { valid: false, cards: [], newCards: [], skippedCards: [], errors: parsed.errors, mode };
    }

    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

    const candidateTerms = parsed.payload.cards.map((c) => normalizeTerm(c.term)).filter(Boolean);
    const existingVocabularyMap = await this.findGlobalDuplicates(db, candidateTerms);
    const { uniqueCards, skippedDuplicates } = this.partitionCardsByGlobalDuplicates(
      parsed.payload.cards,
      existingVocabularyMap,
      deck.id
    );

    return {
      valid: true,
      cards: parsed.payload.cards,
      newCards: uniqueCards,
      skippedCards: skippedDuplicates.filter((card) => card.status === "DUPLICATE_WITHIN_IMPORT"),
      existingCards: skippedDuplicates.filter((card) => card.status !== "DUPLICATE_WITHIN_IMPORT"),
      errors: [],
      mode,
    };
  }

  /**
   * Revalidates and writes non-duplicate JSON flashcards in one database transaction.
   * Duplicate words are skipped gracefully with friendly logs/reasons without aborting the import.
   */
  async importJsonFlashcards(
    deckId: string,
    rawJson: string,
    options: JsonFlashcardImportOptions = {}
  ) {
    const mode = options.mode ?? "legacy";
    const externalParsed = mode === "external-ai-v3"
      ? options.manifest ? parseExternalAiV3Import(rawJson, options.manifest) : null
      : null;
    if (mode === "external-ai-v3") {
      if (!externalParsed) throw new JsonFlashcardImportError(["External AI V3 cần danh sách term gốc để kiểm tra kết quả."]);
      if (!externalParsed.valid) throw new JsonFlashcardImportError(externalParsed.errors);
    }
    const parsed = mode === "external-ai-v3"
      ? externalParsed!
      : parseJsonFlashcardImport(rawJson);
    if (!parsed.valid) throw new JsonFlashcardImportError(parsed.errors);

    const review = mode === "external-ai-v3"
      ? externalAiV3ImportReviewSchema.safeParse(options.review)
      : null;
    if (mode === "external-ai-v3" && (!review || !review.success)) {
      throw new JsonFlashcardImportError(
        review?.error.issues.map((issue) => issue.message) ?? ["External AI V3 cần kết quả xem trước mới nhất trước khi nhập."]
      );
    }
    const externalReview = review && review.success ? review.data : undefined;

    return db.$transaction(async (tx) => {
      const deck = await tx.deck.findUnique({
        where: { id: deckId },
        select: { id: true, name: true },
      });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");

      if (mode === "external-ai-v3") {
        if (!externalReview) throw new JsonFlashcardImportError(["External AI V3 cần Preview mới nhất trước khi xác nhận import."]);
        const plan = await this.createExternalAiV3ImportPlan(tx, parsed.payload.cards, externalReview);
        const result = await this.persistJsonCards(tx, deck.id, plan.newCards);
        if (result.skippedDuplicates.length > 0) {
          throw new StaleJsonFlashcardImportPreviewError();
        }

        for (const overwrite of plan.overwrites) {
          await tx.flashcard.update({
            where: { id: overwrite.existing.id },
            data: this.toExternalAiContentUpdate(overwrite.incoming, overwrite.existing),
          });
        }

        return {
          deckId: deck.id,
          deckName: deck.name,
          ...result,
          existingUpdated: plan.overwrites.length,
          existingKept: plan.existingCount - plan.overwrites.length,
          ambiguousSkipped: plan.ambiguousCount,
          linkedExistingCards: 0,
          alreadyLinkedCards: 0,
          linkErrors: [],
        };
      }

      const result = await this.persistJsonCards(tx, deck.id, parsed.payload.cards);
      const linkResult = await this.linkApprovedExistingVocabulary(tx, deck.id, parsed.payload.cards, options.linkExistingCardIds ?? []);

      return {
        deckId: deck.id,
        deckName: deck.name,
        ...result,
        ...linkResult,
      };
    });
  }

  private async createExternalAiV3ImportPlan(
    tx: Prisma.TransactionClient,
    cards: JsonFlashcard[],
    review: ExternalAiV3ImportReview
  ): Promise<{
    newCards: JsonFlashcard[];
    overwrites: Array<{ existing: ExistingVocabularyCandidate; incoming: JsonFlashcard }>;
    existingCount: number;
    ambiguousCount: number;
  }> {
    const normalizedTerms = cards.map((card) => normalizeTerm(card.term));
    const snapshotByTerm = new Map(review.snapshots.map((snapshot) => [snapshot.normalizedTerm, snapshot]));
    if (snapshotByTerm.size !== cards.length || normalizedTerms.some((term) => !snapshotByTerm.has(term))) {
      throw new StaleJsonFlashcardImportPreviewError();
    }

    const existingVocabulary = await this.findGlobalDuplicates(tx, normalizedTerms);
    const decisionById = new Map(review.decisions.map((decision) => [decision.flashcardId, decision]));
    const newCards: JsonFlashcard[] = [];
    const overwrites: Array<{ existing: ExistingVocabularyCandidate; incoming: JsonFlashcard }> = [];
    let existingCount = 0;
    let ambiguousCount = 0;

    for (const card of cards) {
      const normalizedTerm = normalizeTerm(card.term);
      const snapshot = snapshotByTerm.get(normalizedTerm);
      const existing = existingVocabulary.get(normalizedTerm);
      const isAmbiguous = Boolean(existing && (existing.hasHistoricalDuplicates || existing.cardIds.length !== 1));
      const classification = !existing ? "new" : isAmbiguous ? "ambiguous" : "existing";
      if (!snapshot || snapshot.classification !== classification || snapshot.incomingFingerprint !== this.createExternalAiV3IncomingFingerprint(card)) {
        throw new StaleJsonFlashcardImportPreviewError();
      }

      if (classification === "new") {
        newCards.push(card);
        continue;
      }
      if (classification === "ambiguous") {
        ambiguousCount += 1;
        continue;
      }

      const canonical = existing!.candidates[0];
      if (!canonical || snapshot.flashcardId !== canonical.id || snapshot.contentVersion !== canonical.contentVersion) {
        throw new StaleJsonFlashcardImportPreviewError();
      }
      existingCount += 1;

      const decision = decisionById.get(canonical.id);
      if (!decision) continue;
      if (canonical.partOfSpeech && canonical.partOfSpeech !== card.partOfSpeech && !decision.confirmsPartOfSpeechChange) {
        throw new JsonFlashcardImportError([`"${card.term}" đổi từ loại; hãy xác nhận riêng trước khi ghi đè.`]);
      }
      overwrites.push({ existing: canonical, incoming: card });
    }

    if (Array.from(decisionById.keys()).some((id) => !overwrites.some((overwrite) => overwrite.existing.id === id))) {
      throw new StaleJsonFlashcardImportPreviewError();
    }
    return { newCards, overwrites, existingCount, ambiguousCount };
  }

  private toExternalAiContentUpdate(
    incoming: JsonFlashcard,
    existing: ExistingVocabularyCandidate
  ): Prisma.FlashcardUpdateInput {
    const effective = this.resolveEffectiveIncomingCard(incoming, existing);
    return {
      meaningVi: incoming.meaningVi,
      partOfSpeech: incoming.partOfSpeech ?? null,
      ipa: effective.ipa ?? null,
      definitionEn: incoming.definitionEn ?? null,
      exampleEn: incoming.exampleEn ?? null,
      exampleVi: incoming.exampleVi ?? null,
      cefr: effective.cefr ?? null,
      imageUrl: effective.imageUrl ?? null,
    };
  }

  /** Explicitly associates one existing canonical Flashcard with a new Deck. */
  async linkExistingVocabularyToDeck(deckId: string, flashcardId: string) {
    return db.$transaction((tx) => this.linkExistingVocabularyInTransaction(tx, deckId, flashcardId));
  }

  private async linkExistingVocabularyInTransaction(
    tx: Prisma.TransactionClient,
    deckId: string,
    flashcardId: string
  ): Promise<{ linked: boolean; alreadyLinked: boolean; flashcardId: string }> {
    const [deck, card] = await Promise.all([
      tx.deck.findUnique({ where: { id: deckId }, select: { id: true } }),
      tx.flashcard.findUnique({ where: { id: flashcardId }, select: { id: true, normalizedTerm: true } }),
    ]);
    if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ đã chọn.");
    if (!card) throw new ResourceNotFoundError("Không tìm thấy hồ sơ từ vựng.");

    const identity = await tx.vocabularyIdentity.findUnique({
      where: { normalizedTerm: card.normalizedTerm },
      select: { hasHistoricalDuplicates: true, canonicalFlashcardId: true },
    });
    if (identity?.hasHistoricalDuplicates || (identity?.canonicalFlashcardId && identity.canonicalFlashcardId !== card.id)) {
      throw new AmbiguousVocabularyIdentityError();
    }

    // The unique index is the authority here. A read-then-create sequence can
    // race across requests, whereas SQLite's ON CONFLICT path atomically
    // creates at most one source association and tells this caller whether it
    // performed the insert.
    const inserted = await tx.$executeRaw`
      INSERT INTO "deck_vocabulary_memberships" ("id", "deckId", "flashcardId", "createdAt")
      VALUES (${crypto.randomUUID()}, ${deckId}, ${card.id}, CURRENT_TIMESTAMP)
      ON CONFLICT("deckId", "flashcardId") DO NOTHING
    `;
    return {
      linked: inserted === 1,
      alreadyLinked: inserted === 0,
      flashcardId: card.id,
    };
  }

  private async linkApprovedExistingVocabulary(
    tx: Prisma.TransactionClient,
    deckId: string,
    importedCards: Array<{ term: string }>,
    approvedCardIds: string[]
  ): Promise<{ linkedExistingCards: number; alreadyLinkedCards: number; linkErrors: string[] }> {
    const approved = [...new Set(approvedCardIds)].filter(Boolean);
    if (approved.length === 0) return { linkedExistingCards: 0, alreadyLinkedCards: 0, linkErrors: [] };

    const importedTerms = new Set(importedCards.map((card) => normalizeTerm(card.term)).filter(Boolean));
    const candidates = await tx.flashcard.findMany({
      where: { id: { in: approved } },
      select: { id: true, normalizedTerm: true, term: true },
    });
    const candidateById = new Map(candidates.map((card) => [card.id, card]));
    let linkedExistingCards = 0;
    let alreadyLinkedCards = 0;
    const linkErrors: string[] = [];

    for (const cardId of approved) {
      const candidate = candidateById.get(cardId);
      if (!candidate || !importedTerms.has(candidate.normalizedTerm)) {
        linkErrors.push(`Không thể liên kết hồ sơ từ vựng không thuộc JSON đã kiểm tra: "${cardId}".`);
        continue;
      }
      try {
        const result = await this.linkExistingVocabularyInTransaction(tx, deckId, candidate.id);
        if (result.linked) linkedExistingCards += 1;
        if (result.alreadyLinked) alreadyLinkedCards += 1;
      } catch (error) {
        if (error instanceof AmbiguousVocabularyIdentityError) {
          linkErrors.push(`"${candidate.term}" có nhiều bản ghi lịch sử và chưa thể tự liên kết.`);
          continue;
        }
        throw error;
      }
    }

    return { linkedExistingCards, alreadyLinkedCards, linkErrors };
  }

  /** Finds matching vocabulary identities across all decks and collections. */
  private async findGlobalDuplicates(
    tx: Prisma.TransactionClient | typeof db,
    candidateNormalizedTerms: string[]
  ): Promise<Map<string, ExistingVocabularyIdentity>> {
    return findExistingVocabularyIdentities(tx, candidateNormalizedTerms);
  }

  private async buildManualFlashcardDuplicatePreview(
    tx: Prisma.TransactionClient | typeof db,
    card: ManualFlashcardItem
  ): Promise<ManualFlashcardDuplicatePreview> {
    const normalizedTerm = normalizeTerm(card.term);
    const identity = (await this.findGlobalDuplicates(tx, [normalizedTerm])).get(normalizedTerm);
    const incomingFingerprint = this.createManualFlashcardIncomingFingerprint(card);
    if (!identity) {
      return { classification: "new", incomingFingerprint, changedFields: [] };
    }

    if (identity.hasHistoricalDuplicates || identity.cardIds.length !== 1 || !identity.candidates[0]) {
      return {
        classification: "ambiguous",
        incomingFingerprint,
        changedFields: [],
        existingCandidates: identity.candidates,
        reason: "Có nhiều bản ghi lịch sử cùng từ này. Hãy xử lý trong thư viện từ vựng trước khi ghi đè.",
      };
    }

    const existingCard = identity.candidates[0];
    return {
      classification: "existing",
      incomingFingerprint,
      existingCard,
      changedFields: this.findManualStudyChangedFields(card, existingCard),
    };
  }

  private findManualStudyChangedFields(
    incoming: ManualFlashcardItem,
    existing: ExistingVocabularyCandidate
  ): string[] {
    const changedFields: string[] = [];
    if (incoming.meaningVi.trim() !== existing.meaningVi.trim()) changedFields.push("meaningVi");

    const optionalFields: Array<[
      string,
      string | undefined,
      string | null
    ]> = [
      ["partOfSpeech", incoming.partOfSpeech, existing.partOfSpeech],
      ["ipa", incoming.ipa, existing.ipa],
      ["definitionEn", incoming.definitionEn, existing.definitionEn],
      ["exampleEn", incoming.exampleEn, existing.exampleEn],
      ["exampleVi", incoming.exampleVi, existing.exampleVi],
      ["cefr", incoming.cefr, existing.cefr],
      ["imageUrl", incoming.imageUrl, existing.imageUrl],
    ];

    for (const [field, incomingValue, existingValue] of optionalFields) {
      if (incomingValue !== undefined && incomingValue.trim() !== (existingValue ?? "").trim()) {
        changedFields.push(field);
      }
    }
    return changedFields;
  }

  private createManualFlashcardIncomingFingerprint(card: ManualFlashcardItem): string {
    return createHash("sha256").update(JSON.stringify({
      term: normalizeTerm(card.term),
      meaningVi: card.meaningVi,
      partOfSpeech: card.partOfSpeech ?? null,
      ipa: card.ipa ?? null,
      definitionEn: card.definitionEn ?? null,
      exampleEn: card.exampleEn ?? null,
      exampleVi: card.exampleVi ?? null,
      cefr: card.cefr ?? null,
      imageUrl: card.imageUrl ?? null,
    })).digest("hex");
  }

  /** Blank optional fields mean "leave the existing detail alone" in study. */
  private toManualStudyContentUpdate(card: ManualFlashcardItem): Prisma.FlashcardUpdateInput {
    return {
      meaningVi: card.meaningVi,
      ...(card.partOfSpeech !== undefined ? { partOfSpeech: card.partOfSpeech } : {}),
      ...(card.ipa !== undefined ? { ipa: card.ipa } : {}),
      ...(card.definitionEn !== undefined ? { definitionEn: card.definitionEn } : {}),
      ...(card.exampleEn !== undefined ? { exampleEn: card.exampleEn } : {}),
      ...(card.exampleVi !== undefined ? { exampleVi: card.exampleVi } : {}),
      ...(card.cefr !== undefined ? { cefr: card.cefr } : {}),
      ...(card.imageUrl !== undefined
        ? { imageUrl: card.imageUrl, imageSource: "MANUAL" }
        : {}),
    };
  }

  /** Separates global and in-batch duplicates without silently discarding them. */
  private partitionCardsByGlobalDuplicates<T extends { term: string }>(
    cards: T[],
    existingVocabulary: Map<string, ExistingVocabularyIdentity>,
    targetDeckId?: string
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
          status: "DUPLICATE_WITHIN_IMPORT",
        });
        continue;
      }
      seenInBatch.add(normalized);

      const existing = existingVocabulary.get(normalized);
      if (existing) {
        skippedDuplicates.push({
          term: card.term,
          normalizedTerm: normalized,
          ...this.describeExistingVocabulary(card, normalized, existing, targetDeckId),
        });
        continue;
      }

      uniqueCards.push(card);
    }

    return { uniqueCards, skippedDuplicates };
  }

  private describeExistingVocabulary(
    imported: { term: string } & Partial<JsonFlashcard>,
    _normalizedTerm: string,
    existing: ExistingVocabularyIdentity,
    targetDeckId?: string
  ): Omit<SkippedDuplicateCard, "term" | "normalizedTerm"> {
    const primary = existing.locations[0];
    const isAmbiguous = existing.hasHistoricalDuplicates || existing.cardIds.length !== 1;
    const canonicalCandidate = !isAmbiguous ? existing.candidates[0] : undefined;
    const existingCardId = canonicalCandidate
      ? existing.cardIds[0]
      : undefined;
    const contentConflictFields = this.findContentConflictFields(imported, existing);
    const status = isAmbiguous
      ? "AMBIGUOUS_LEGACY_IDENTITY"
      : contentConflictFields.length > 0
        ? "CONTENT_CONFLICT"
        : targetDeckId && existing.locations.some((location) => location.deckId === targetDeckId)
          ? "EXISTING_ALREADY_LINKED"
          : "EXISTING_NOT_LINKED";
    return {
      reason: status === "AMBIGUOUS_LEGACY_IDENTITY"
        ? "Có nhiều bản ghi lịch sử cùng normalized term; cần đối soát thủ công trước khi liên kết."
        : status === "EXISTING_ALREADY_LINKED"
          ? "Đã được liên kết với bộ thẻ đích."
          : existing.locations.length === 0
            ? "Đã tồn tại trong WordNest nhưng hiện chưa thuộc bộ thẻ nào."
          : `Đã tồn tại trong ${describeExistingVocabularyLocation(existing)}.`,
      status,
      existingCardId,
      existingDeckId: primary?.deckId,
      existingDeckName: primary?.deckName,
      existingFolderName: primary?.folderName,
      existingLocations: existing.locations.map((location) => ({
        cardId: location.cardId,
        deckId: location.deckId,
        deckName: location.deckName,
        folderName: location.folderName,
      })),
      contentConflictFields,
      existingCard: canonicalCandidate,
      existingCandidates: isAmbiguous ? existing.candidates : undefined,
      // An ambiguous identity cannot inherit optional metadata from one of its
      // candidates, but the user must still see the AI payload while deciding
      // to skip it. The server will never write this branch automatically.
      effectiveIncomingCard: canonicalCandidate ? this.resolveEffectiveIncomingCard(imported, canonicalCandidate) : imported,
      requiresIndividualOverwriteConfirmation: Boolean(
        canonicalCandidate?.partOfSpeech &&
        imported.partOfSpeech &&
        canonicalCandidate.partOfSpeech !== imported.partOfSpeech
      ),
    };
  }

  private findContentConflictFields(
    imported: Partial<JsonFlashcard>,
    existing: ExistingVocabularyIdentity
  ): string[] {
    const fields: Array<keyof Pick<JsonFlashcard, "meaningVi" | "partOfSpeech" | "definitionEn" | "exampleEn" | "exampleVi" | "ipa" | "cefr" | "imageUrl">> = [
      "meaningVi", "partOfSpeech", "definitionEn", "exampleEn", "exampleVi", "ipa", "cefr", "imageUrl",
    ];
    return fields.filter((field) => {
      const incoming = imported[field];
      const current = existing[field];
      if (incoming === undefined || incoming === null || current === undefined || current === null) return false;
      return incoming.trim() !== current.trim();
    });
  }

  private resolveEffectiveIncomingCard(
    imported: { term: string } & Partial<JsonFlashcard>,
    existing: ExistingVocabularyCandidate
  ): { term: string } & Partial<JsonFlashcard> {
    const preservedCefr = existing.cefr && CEFR_LEVELS.includes(existing.cefr as (typeof CEFR_LEVELS)[number])
      ? existing.cefr as (typeof CEFR_LEVELS)[number]
      : null;
    return {
      ...imported,
      ipa: imported.ipa ?? existing.ipa,
      cefr: imported.cefr ?? preservedCefr,
      imageUrl: imported.imageUrl ?? existing.imageUrl,
    };
  }

  private createExternalAiV3ReviewSnapshots(
    cards: JsonFlashcard[],
    existingVocabulary: Map<string, ExistingVocabularyIdentity>
  ): ExternalAiV3ImportReview["snapshots"] {
    return cards.map((card) => {
      const normalizedTerm = normalizeTerm(card.term);
      const existing = existingVocabulary.get(normalizedTerm);
      const incomingFingerprint = this.createExternalAiV3IncomingFingerprint(card);
      if (!existing) return { normalizedTerm, classification: "new" as const, incomingFingerprint };
      const isAmbiguous = existing.hasHistoricalDuplicates || existing.cardIds.length !== 1;
      if (isAmbiguous) return { normalizedTerm, classification: "ambiguous" as const, incomingFingerprint };
      const candidate = existing.candidates[0];
      if (!candidate) return { normalizedTerm, classification: "ambiguous" as const, incomingFingerprint };
      return {
        normalizedTerm,
        classification: "existing" as const,
        incomingFingerprint,
        flashcardId: candidate.id,
        contentVersion: candidate.contentVersion,
      };
    });
  }

  private createExternalAiV3IncomingFingerprint(card: JsonFlashcard): string {
    return createHash("sha256").update(JSON.stringify({
      term: card.term,
      meaningVi: card.meaningVi,
      partOfSpeech: card.partOfSpeech ?? null,
      ipa: card.ipa ?? null,
      definitionEn: card.definitionEn ?? null,
      exampleEn: card.exampleEn ?? null,
      exampleVi: card.exampleVi ?? null,
      cefr: card.cefr ?? null,
      imageUrl: card.imageUrl ?? null,
    })).digest("hex");
  }

  private toJsonImportCardData(deckId: string, card: JsonFlashcard): Prisma.FlashcardUncheckedCreateInput {
    return {
      // The compatibility trigger backfills the authoritative membership in
      // the same SQLite statement. Keeping this legacy source reference lets
      // older integrations continue to read their originating Deck.
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

  private async persistJsonCards(
    tx: Prisma.TransactionClient,
    deckId: string,
    cards: JsonFlashcard[]
  ): Promise<{ cardsCreated: number; skippedDuplicates: SkippedDuplicateCard[] }> {
    return this.persistGloballyUniqueCards(tx, deckId, cards, (card) => this.toJsonImportCardData(deckId, card));
  }

  /**
   * Rechecks global identity inside the write transaction, then creates cards
   * one by one so a concurrent duplicate can be reported without discarding
   * unrelated, valid cards from the same batch.
   */
  private async persistGloballyUniqueCards<T extends { term: string }>(
    tx: Prisma.TransactionClient,
    deckId: string,
    cards: T[],
    toData: (card: T) => Prisma.FlashcardUncheckedCreateInput
  ): Promise<{ cardsCreated: number; skippedDuplicates: SkippedDuplicateCard[] }> {
    const candidateTerms = cards.map((card) => normalizeTerm(card.term)).filter(Boolean);
    const existingVocabulary = await this.findGlobalDuplicates(tx, candidateTerms);
    const { uniqueCards, skippedDuplicates } = this.partitionCardsByGlobalDuplicates(cards, existingVocabulary, deckId);
    let cardsCreated = 0;

    for (const card of uniqueCards) {
      try {
        const created = await tx.flashcard.create({ data: toData(card) });
        await tx.deckVocabularyMembership.upsert({
          where: { deckId_flashcardId: { deckId, flashcardId: created.id } },
          create: { deckId, flashcardId: created.id },
          update: {},
        });
        cardsCreated += 1;
      } catch (error) {
        if (!isGlobalVocabularyDuplicateError(error) && !(error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003"].includes(error.code))) {
          throw error;
        }
        const normalized = normalizeTerm(card.term);
        const racedExisting = (await this.findGlobalDuplicates(tx, [normalized])).get(normalized);
        if (!racedExisting) throw error;
        skippedDuplicates.push({
          term: card.term,
          normalizedTerm: normalized,
          ...this.describeExistingVocabulary(card, normalized, racedExisting, deckId),
        });
      }
    }

    return { cardsCreated, skippedDuplicates };
  }

  private async persistManualCards(
    tx: Prisma.TransactionClient,
    deckId: string,
    cards: ManualFlashcardItem[]
  ): Promise<{ cardsCreated: number; skippedDuplicates: SkippedDuplicateCard[] }> {
    return this.persistGloballyUniqueCards(tx, deckId, cards, (card) => ({
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
      }));
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
