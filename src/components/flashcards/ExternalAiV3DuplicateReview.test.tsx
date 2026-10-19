import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ExternalAiV3DuplicateReview,
  getEffectiveChangedFields,
  type DuplicateReviewCard,
} from "./ExternalAiV3DuplicateReview";

function duplicate(id: string, term: string): DuplicateReviewCard {
  return {
    term,
    normalizedTerm: term,
    reason: "Từ này đã tồn tại.",
    status: "CONTENT_CONFLICT",
    existingCard: {
      id,
      term,
      normalizedTerm: term,
      meaningVi: "nghĩa cũ",
      partOfSpeech: "noun",
      ipa: "/təst/",
      definitionEn: "an existing definition",
      exampleEn: "The existing example is clear.",
      exampleVi: "Ví dụ hiện có rõ ràng.",
      cefr: "B1",
      imageUrl: "https://example.com/current.jpg",
      contentVersion: "version-1",
      reviewCount: 4,
      fsrsState: 2,
      fsrsRepetitions: 3,
      locations: [{ cardId: id, deckId: "deck-a", deckName: "Deck A" }],
    },
    effectiveIncomingCard: {
      term,
      meaningVi: "nghĩa AI mới",
      partOfSpeech: "noun",
      ipa: "/təst/",
      definitionEn: "an existing definition",
      exampleEn: "The existing example is clear.",
      exampleVi: "Ví dụ hiện có rõ ràng.",
      cefr: "B1",
      imageUrl: "https://example.com/current.jpg",
    },
  };
}

describe("ExternalAiV3DuplicateReview", () => {
  const first = duplicate("card-first", "allocate");
  const second = duplicate("card-second", "allocate resources");
  const conflict: DuplicateReviewCard = {
    term: "address",
    normalizedTerm: "address",
    reason: "Có nhiều hồ sơ lịch sử phù hợp.",
    status: "AMBIGUOUS_LEGACY_IDENTITY",
  };
  const props = {
    decisions: {},
    posAcknowledgements: {},
    onDecision: vi.fn(),
    onPartOfSpeechAcknowledgement: vi.fn(),
    onKeepAll: vi.fn(),
    onOverwriteAll: vi.fn(),
  };

  it("defaults every reviewable duplicate to keep in compact accordion rows", () => {
    const html = renderToStaticMarkup(<ExternalAiV3DuplicateReview duplicates={[first, second, conflict]} newTerms={["create"]} {...props} />);

    expect(html).toContain("1 từ mới · 3 từ trùng · 0 ghi đè · 2 giữ nguyên · 1 cần xử lý");
    expect(html).toContain('name="duplicate-row-decision-card-first" checked=""');
    expect(html).toContain("Ghi đè tất cả");
    expect(html).toContain("Giữ nguyên tất cả");
    expect(html.indexOf("Giữ nguyên tất cả")).toBeLessThan(html.indexOf("Ghi đè tất cả"));
    expect(html).toContain("Cần xử lý");
    expect(html).not.toContain("Danh sách từ trùng");
    expect(html).not.toContain("Flashcard hiện có");
  });

  it("compares only effective values that will change", () => {
    expect(getEffectiveChangedFields(first.existingCard!, first.effectiveIncomingCard!).map(({ key }) => key)).toEqual(["meaningVi"]);
  });

  it("makes individual confirmation visible instead of silently overwriting a POS change", () => {
    const posChanged: DuplicateReviewCard = {
      ...first,
      requiresIndividualOverwriteConfirmation: true,
      effectiveIncomingCard: { ...first.effectiveIncomingCard!, partOfSpeech: "verb" },
    };
    const html = renderToStaticMarkup(<ExternalAiV3DuplicateReview duplicates={[posChanged]} newTerms={[]} {...props} />);

    expect(html).toContain("1 từ đổi từ loại cần xác nhận riêng");
    expect(html).toContain("Ghi đè tất cả” sẽ giữ nguyên các từ này.");
  });

  it("keeps the shared-vocabulary consequence visible before an overwrite decision", () => {
    const shared = duplicate("card-shared", "context");
    shared.existingCard!.locations.push({ cardId: "card-shared", deckId: "deck-b", deckName: "Deck B" });

    const html = renderToStaticMarkup(<ExternalAiV3DuplicateReview duplicates={[shared]} newTerms={[]} {...props} />);

    expect(html).toContain("Một số thẻ đang dùng ở nhiều Deck; ghi đè sẽ cập nhật nội dung ở mọi Deck đó.");
  });
});
