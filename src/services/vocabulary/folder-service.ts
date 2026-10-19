import { FlashcardStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ResourceConflictError, ResourceNotFoundError } from "@/lib/http/errors";
import type { CreateFolderInput, UpdateFolderInput } from "@/lib/validation/folder";
import {
  assertDeletionPreviewIsCurrent,
  createDeletionPreviewFingerprint,
} from "./deletion-preview";

export type DeckLearningStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface FolderDeckSummary {
  id: string;
  name: string;
  description: string | null;
  position: number;
  totalCards: number;
  newCount: number;
  learningCount: number;
  knownCount: number;
  dueTodayCount: number;
  masteryRate: number;
  learningStatus: DeckLearningStatus;
}

export interface FolderProgress {
  deckCount: number;
  completedDecks: number;
  totalCards: number;
  newCount: number;
  learningCount: number;
  knownCount: number;
  dueTodayCount: number;
  masteryRate: number;
}

export interface FolderDetail {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  position: number;
  decks: FolderDeckSummary[];
  progress: FolderProgress;
}

export interface FolderOption {
  id: string;
  name: string;
}

export interface FolderDeletionImpact {
  /** Server-calculated snapshot that must be echoed on the destructive request. */
  fingerprint: string;
  decks: number;
  decksBecomingUncategorized: number;
  vocabularyMemberships: number;
  canonicalFlashcards: number;
  sharedWithOtherCollections: number;
  canonicalFlashcardsDeleted: number;
  learningHistoriesDeleted: number;
  vocabularyPreserved: true;
  learningDataPreserved: true;
}

type DeckWithLearningData = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  vocabularyMemberships: Array<{
    flashcard: {
      id: string;
      status: FlashcardStatus;
      state: number;
      due: Date;
    };
  }>;
};

function normalizeFolderName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function getEndOfToday(now = new Date()): Date {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return endOfToday;
}

function summarizeDeck(deck: DeckWithLearningData, endOfToday: Date): FolderDeckSummary {
  let newCount = 0;
  let learningCount = 0;
  let knownCount = 0;
  let dueTodayCount = 0;

  const cards = deck.vocabularyMemberships.map((membership) => membership.flashcard);
  for (const card of cards) {
    if (card.status === FlashcardStatus.NEW) newCount += 1;
    else if (card.status === FlashcardStatus.LEARNING) learningCount += 1;
    else if (card.status === FlashcardStatus.KNOWN) knownCount += 1;

    if (card.state > 0 && card.due <= endOfToday) dueTodayCount += 1;
  }

  const totalCards = cards.length;
  const masteryRate = totalCards > 0 ? Number(((knownCount / totalCards) * 100).toFixed(1)) : 0;
  const learningStatus: DeckLearningStatus =
    totalCards > 0 && knownCount === totalCards
      ? "COMPLETED"
      : newCount === totalCards
        ? "NOT_STARTED"
        : "IN_PROGRESS";

  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    position: deck.position,
    totalCards,
    newCount,
    learningCount,
    knownCount,
    dueTodayCount,
    masteryRate,
    learningStatus,
  };
}

function summarizeFolder(decks: DeckWithLearningData[], endOfToday: Date): FolderProgress {
  const deckSummaries = decks.map((deck) => summarizeDeck(deck, endOfToday));
  const cardsById = new Map<string, DeckWithLearningData["vocabularyMemberships"][number]["flashcard"]>();
  for (const deck of decks) {
    for (const membership of deck.vocabularyMemberships) {
      cardsById.set(membership.flashcard.id, membership.flashcard);
    }
  }

  let newCount = 0;
  let learningCount = 0;
  let knownCount = 0;
  let dueTodayCount = 0;
  for (const card of cardsById.values()) {
    if (card.status === FlashcardStatus.NEW) newCount += 1;
    else if (card.status === FlashcardStatus.LEARNING) learningCount += 1;
    else if (card.status === FlashcardStatus.KNOWN) knownCount += 1;
    if (card.state > 0 && card.due <= endOfToday) dueTodayCount += 1;
  }

  const totalCards = cardsById.size;
  return {
    deckCount: decks.length,
    completedDecks: deckSummaries.filter((deck) => deck.learningStatus === "COMPLETED").length,
    totalCards,
    newCount,
    learningCount,
    knownCount,
    dueTodayCount,
    masteryRate: totalCards > 0 ? Number(((knownCount / totalCards) * 100).toFixed(1)) : 0,
  };
}

const deckLearningInclude = {
  vocabularyMemberships: {
    select: {
      flashcard: {
        select: {
          id: true,
          status: true,
          state: true,
          due: true,
        },
      },
    },
  },
} satisfies Prisma.DeckInclude;

export class FolderService {
  async createFolder(input: CreateFolderInput) {
    const normalizedName = normalizeFolderName(input.name);

    try {
      const lastFolder = await db.folder.findFirst({
        orderBy: { position: "desc" },
        select: { position: true },
      });
      return await db.folder.create({
        data: {
          name: input.name.trim(),
          normalizedName,
          description: input.description ?? null,
          icon: input.icon ?? "book",
          color: input.color ?? "orange",
          position: (lastFolder?.position ?? -1) + 1,
        },
      });
    } catch (error) {
      this.rethrowFolderNameConflict(error);
    }
  }

  async getFolders(): Promise<FolderDetail[]> {
    const folders = await db.folder.findMany({
      include: {
        decks: {
          include: deckLearningInclude,
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });

    const endOfToday = getEndOfToday();
    return folders.map((folder) => this.toFolderDetail(folder, endOfToday));
  }

  /**
   * Lightweight folder list for selectors that do not display progress data.
   */
  async getFolderOptions(): Promise<FolderOption[]> {
    return db.folder.findMany({
      select: { id: true, name: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  async getFolder(folderId: string): Promise<FolderDetail | null> {
    const folder = await db.folder.findUnique({
      where: { id: folderId },
      include: {
        decks: {
          include: deckLearningInclude,
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    return folder ? this.toFolderDetail(folder, getEndOfToday()) : null;
  }

  async getLibrary() {
    const [folders, uncategorized, unassignedVocabularyCount] = await Promise.all([
      this.getFolders(),
      db.deck.findMany({
        where: { folderId: null },
        include: deckLearningInclude,
        orderBy: { updatedAt: "desc" },
      }),
      db.flashcard.count({ where: { deckMemberships: { none: {} } } }),
    ]);
    const endOfToday = getEndOfToday();

    return {
      folders,
      uncategorizedDecks: uncategorized.map((deck) => summarizeDeck(deck, endOfToday)),
      unassignedVocabularyCount,
    };
  }

  async getUnassignedVocabulary() {
    return db.flashcard.findMany({
      where: { deckMemberships: { none: {} } },
      select: {
        id: true,
        term: true,
        meaningVi: true,
        partOfSpeech: true,
        due: true,
        state: true,
        reps: true,
        lastReviewAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { term: "asc" }],
    });
  }

  async updateFolder(folderId: string, input: UpdateFolderInput) {
    await this.getFolderOrThrow(folderId);
    const data: Prisma.FolderUpdateInput = {
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.icon ? { icon: input.icon } : {}),
      ...(input.color ? { color: input.color } : {}),
    };

    if (input.name) {
      data.name = input.name.trim();
      data.normalizedName = normalizeFolderName(input.name);
    }

    try {
      return await db.folder.update({ where: { id: folderId }, data });
    } catch (error) {
      this.rethrowFolderNameConflict(error);
    }
  }

  async deleteFolder(folderId: string, expectedImpactFingerprint?: string) {
    return db.$transaction(async (tx) => {
      const impact = await this.getFolderDeletionImpactInTransaction(tx, folderId);
      assertDeletionPreviewIsCurrent(expectedImpactFingerprint, impact.fingerprint);

      await tx.deck.updateMany({
        where: { folderId },
        data: { folderId: null, position: 0 },
      });
      await tx.folder.delete({ where: { id: folderId } });
    });
  }

  /** Calculates the exact organizational impact without mutating a Folder. */
  async getFolderDeletionImpact(folderId: string): Promise<FolderDeletionImpact> {
    return db.$transaction((tx) => this.getFolderDeletionImpactInTransaction(tx, folderId));
  }

  private async getFolderDeletionImpactInTransaction(
    tx: Prisma.TransactionClient,
    folderId: string
  ): Promise<FolderDeletionImpact> {
    const [folder, decks] = await Promise.all([
      tx.folder.findUnique({ where: { id: folderId }, select: { id: true, updatedAt: true } }),
      tx.deck.findMany({
        where: { folderId },
        select: {
          id: true,
          folderId: true,
          position: true,
          updatedAt: true,
          stories: { select: { id: true, updatedAt: true }, orderBy: { id: "asc" } },
          lessons: { select: { id: true, updatedAt: true }, orderBy: { id: "asc" } },
          quizAttempts: { select: { id: true, createdAt: true }, orderBy: { id: "asc" } },
          quizSessions: { select: { id: true, createdAt: true, expiresAt: true }, orderBy: { id: "asc" } },
        },
        orderBy: { id: "asc" },
      }),
    ]);
    if (!folder) throw new ResourceNotFoundError("Không tìm thấy learning collection.");

    const deckIds = decks.map((deck) => deck.id);
    const memberships = deckIds.length > 0
      ? await tx.deckVocabularyMembership.findMany({
          where: { deckId: { in: deckIds } },
          select: { id: true, deckId: true, flashcardId: true, createdAt: true },
          orderBy: { id: "asc" },
        })
      : [];
    const cardIds = [...new Set(memberships.map((membership) => membership.flashcardId))];
    const [cards, reviewLogs, practiceAttempts] = await Promise.all([
      cardIds.length > 0
        ? tx.flashcard.findMany({
            where: { id: { in: cardIds } },
            select: {
              id: true,
              deckMemberships: {
                select: { id: true, deckId: true, createdAt: true, deck: { select: { folderId: true } } },
                orderBy: { id: "asc" },
              },
            },
            orderBy: { id: "asc" },
          })
        : [],
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
    const sharedWithOtherCollections = cards.filter((card) =>
      card.deckMemberships.some((membership) =>
        membership.deck.folderId !== null && membership.deck.folderId !== folderId
      )
    ).length;
    const fingerprint = createDeletionPreviewFingerprint({
      folder,
      decks,
      memberships,
      cards: cards.map((card) => ({ id: card.id, memberships: card.deckMemberships })),
      reviewLogs,
      practiceAttempts,
    });

    return {
      fingerprint,
      decks: deckIds.length,
      decksBecomingUncategorized: deckIds.length,
      vocabularyMemberships: memberships.length,
      canonicalFlashcards: cardIds.length,
      sharedWithOtherCollections,
      canonicalFlashcardsDeleted: 0,
      learningHistoriesDeleted: 0,
      vocabularyPreserved: true,
      learningDataPreserved: true,
    };
  }

  async createDeckInFolder(folderId: string, name: string, description?: string) {
    return db.$transaction(async (tx) => {
      const folder = await tx.folder.findUnique({ where: { id: folderId }, select: { id: true } });
      if (!folder) throw new ResourceNotFoundError("Không tìm thấy learning collection.");

      const lastDeck = await tx.deck.findFirst({
        where: { folderId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      return tx.deck.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          folderId,
          position: (lastDeck?.position ?? -1) + 1,
        },
      });
    });
  }

  async moveDeck(deckId: string, folderId: string | null) {
    return db.$transaction(async (tx) => {
      const deck = await tx.deck.findUnique({ where: { id: deckId }, select: { id: true } });
      if (!deck) throw new ResourceNotFoundError("Không tìm thấy bộ thẻ.");

      if (!folderId) {
        return tx.deck.update({ where: { id: deckId }, data: { folderId: null, position: 0 } });
      }

      const folder = await tx.folder.findUnique({ where: { id: folderId }, select: { id: true } });
      if (!folder) throw new ResourceNotFoundError("Không tìm thấy learning collection.");

      const lastDeck = await tx.deck.findFirst({
        where: { folderId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      return tx.deck.update({
        where: { id: deckId },
        data: { folderId, position: (lastDeck?.position ?? -1) + 1 },
      });
    });
  }

  async removeDeck(folderId: string, deckId: string) {
    const deck = await db.deck.findUnique({ where: { id: deckId }, select: { folderId: true } });
    if (!deck || deck.folderId !== folderId) {
      throw new ResourceNotFoundError("Không tìm thấy bộ thẻ trong learning collection này.");
    }
    return this.moveDeck(deckId, null);
  }

  async reorderDecks(folderId: string, deckIds: string[]) {
    return db.$transaction(async (tx) => {
      const folder = await tx.folder.findUnique({ where: { id: folderId }, select: { id: true } });
      if (!folder) throw new ResourceNotFoundError("Không tìm thấy learning collection.");

      const decks = await tx.deck.findMany({
        where: { folderId },
        select: { id: true },
      });
      const storedIds = new Set(decks.map((deck) => deck.id));
      if (storedIds.size !== deckIds.length || deckIds.some((id) => !storedIds.has(id))) {
        throw new ResourceConflictError("Danh sách sắp xếp không khớp với các bộ thẻ trong collection.");
      }

      await Promise.all(
        deckIds.map((deckId, position) =>
          tx.deck.update({ where: { id: deckId }, data: { position } })
        )
      );
    });
  }

  async getFolderProgress(folderId: string): Promise<FolderProgress> {
    const folder = await this.getFolderOrThrow(folderId);
    return folder.progress;
  }

  async getNextDeck(folderId: string): Promise<FolderDeckSummary | null> {
    const folder = await this.getFolderOrThrow(folderId);
    return folder.decks.find((deck) => deck.learningStatus !== "COMPLETED") ?? null;
  }

  async getFolderReviewCards(folderId: string) {
    await this.getFolderOrThrow(folderId);
    return db.flashcard.findMany({
      where: {
        deckMemberships: { some: { deck: { folderId } } },
        state: { gt: 0 },
        due: { lte: getEndOfToday() },
      },
      orderBy: [{ due: "asc" }, { createdAt: "asc" }],
    });
  }

  private async getFolderOrThrow(folderId: string): Promise<FolderDetail> {
    const folder = await this.getFolder(folderId);
    if (!folder) throw new ResourceNotFoundError("Không tìm thấy learning collection.");
    return folder;
  }

  private toFolderDetail(
    folder: {
      id: string;
      name: string;
      description: string | null;
      icon: string;
      color: string;
      position: number;
      decks: DeckWithLearningData[];
    },
    endOfToday: Date
  ): FolderDetail {
    const decks = folder.decks.map((deck) => summarizeDeck(deck, endOfToday));
    return {
      id: folder.id,
      name: folder.name,
      description: folder.description,
      icon: folder.icon,
      color: folder.color,
      position: folder.position,
      decks,
      progress: summarizeFolder(folder.decks, endOfToday),
    };
  }

  private rethrowFolderNameConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ResourceConflictError("Đã có learning collection với tên này.");
    }
    throw error;
  }
}

export const folderService = new FolderService();
