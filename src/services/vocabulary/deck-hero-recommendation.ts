export type DeckRecommendationType =
  | "EMPTY_DECK"
  | "REVIEW_DUE"
  | "FOCUSED_PRACTICE"
  | "LEARN_NEW"
  | "READ_CONTEXT";

export type HeroActionType = "NAVIGATE" | "OPEN_ADD_CARDS" | "OPEN_READING_HUB";

export interface DeckHeroAction {
  label: string;
  href?: string;
  actionType: HeroActionType;
}

export interface DeckRecommendationInput {
  deckId: string;
  totalCards: number;
  dueCardsCount: number;
  needPracticeCardsCount: number;
  newCardsCount: number;
}

export interface DeckHeroRecommendation {
  type: DeckRecommendationType;
  badge: string;
  title: string;
  description: string;
  primaryAction: DeckHeroAction;
  secondaryAction?: DeckHeroAction;
}

/**
 * Deterministic recommendation engine for the Deck Hero Banner.
 *
 * Evaluation Order:
 * 0. Empty deck -> prompt user to add cards
 * 1. Due cards > 0 -> scheduled FSRS review has absolute priority
 * 2. Due == 0 && weak > 0 -> focused practice to remediate recent errors
 * 3. Due == 0 && weak == 0 && new > 0 -> learn new cards
 * 4. Due == 0 && weak == 0 && new == 0 -> contextual reading (Story / AI Lesson)
 */
export function computeDeckHeroRecommendation(
  input: DeckRecommendationInput
): DeckHeroRecommendation {
  const { deckId } = input;
  const totalCards = Math.max(0, input.totalCards);
  const dueCardsCount = Math.max(0, input.dueCardsCount);
  const needPracticeCardsCount = Math.max(0, input.needPracticeCardsCount);
  const newCardsCount = Math.max(0, input.newCardsCount);

  // Case 0: Empty deck
  if (totalCards === 0) {
    return {
      type: "EMPTY_DECK",
      badge: "Bắt đầu",
      title: "Bộ từ chưa có thẻ nào",
      description: "Hãy thêm từ vựng để bắt đầu hành trình ghi nhớ và luyện tập.",
      primaryAction: {
        label: "Thêm từ đầu tiên",
        actionType: "OPEN_ADD_CARDS",
      },
    };
  }

  // Case 1: FSRS Scheduled Review Due (Strict priority over practice mistakes)
  if (dueCardsCount > 0) {
    return {
      type: "REVIEW_DUE",
      badge: "Đến hạn ôn tập",
      title: `${dueCardsCount} thẻ đến hạn ôn tập`,
      description: "Ôn tập ngắt quãng (FSRS) giúp củng cố trí nhớ đúng thời điểm sắp quên.",
      primaryAction: {
        label: `Ôn tập ngay (${dueCardsCount} thẻ)`,
        href: `/decks/${deckId}/study`,
        actionType: "NAVIGATE",
      },
      secondaryAction:
        needPracticeCardsCount > 0
          ? {
              label: `Xem ${needPracticeCardsCount} từ cần củng cố`,
              href: `/decks/${deckId}/quiz?mode=focused_practice`,
              actionType: "NAVIGATE",
            }
          : undefined,
    };
  }

  // Case 2: No review due, but recent practice mistakes need remediation
  if (needPracticeCardsCount > 0) {
    return {
      type: "FOCUSED_PRACTICE",
      badge: "Cần củng cố",
      title: `${needPracticeCardsCount} từ cần củng cố`,
      description:
        "Các từ bạn vừa trả lời sai trong bài luyện tập gần đây. Hãy củng cố trước khi học từ mới.",
      primaryAction: {
        label: `Củng cố ${needPracticeCardsCount} từ`,
        href: `/decks/${deckId}/quiz?mode=focused_practice`,
        actionType: "NAVIGATE",
      },
      secondaryAction: {
        label: "Sổ tay câu sai",
        href: `/decks/${deckId}/mistakes`,
        actionType: "NAVIGATE",
      },
    };
  }

  // Case 3: All reviews and remediation done, new cards available
  if (newCardsCount > 0) {
    const sessionBatch = Math.min(newCardsCount, 20);
    const actionLabel =
      newCardsCount > 20
        ? `Học ${sessionBatch} từ mới tiếp theo`
        : `Học từ mới (${newCardsCount} từ)`;

    return {
      type: "LEARN_NEW",
      badge: "Học từ mới",
      title: `Còn ${newCardsCount} từ mới chưa học`,
      description:
        newCardsCount > 20
          ? `Bạn có ${newCardsCount} từ mới chưa học. Mỗi phiên học sẽ nạp ${sessionBatch} từ để não bộ ghi nhớ tối ưu.`
          : "Bạn đã hoàn thành các lượt ôn tập! Hãy bắt đầu nạp các từ vựng mới vào bộ nhớ.",
      primaryAction: {
        label: actionLabel,
        href: `/decks/${deckId}/study`,
        actionType: "NAVIGATE",
      },
      secondaryAction: {
        label: "Thử thách trắc nghiệm",
        href: `/decks/${deckId}/quiz`,
        actionType: "NAVIGATE",
      },
    };
  }

  // Case 4: Everything caught up (due = 0, weak = 0, new = 0)
  return {
    type: "READ_CONTEXT",
    badge: "Đã hoàn thành",
    title: "Bạn đã bắt kịp toàn bộ tiến độ!",
    description:
      "Không còn thẻ đến hạn hay từ yếu. Hãy đọc truyện hoặc luyện bài học AI để tiếp xúc từ trong ngữ cảnh thực tế.",
    primaryAction: {
      label: "Đọc trong ngữ cảnh",
      actionType: "OPEN_READING_HUB",
    },
    secondaryAction: {
      label: "Thử thách ôn tập",
      href: `/decks/${deckId}/quiz`,
      actionType: "NAVIGATE",
    },
  };
}
