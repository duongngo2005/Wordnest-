import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { aiService } from "@/services/ai";
import { storyService } from "@/services/vocabulary";
import { POST } from "./route";

describe("POST /api/stories/translate canonical lexical target", () => {
  const deckIds: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(deckIds.splice(0).map((id) => db.deck.delete({ where: { id } })));
  });

  it("passes the structured canonical target from contextual AI through the Story add-card boundary without stemming", async () => {
    const deck = await db.deck.create({ data: { name: "Story canonical target" } });
    deckIds.push(deck.id);
    const story = await db.story.create({
      data: {
        deckId: deck.id,
        title: "Conference day",
        content: "She attended the conference.",
        cefr: "B1",
        length: "short",
        topic: "Daily Life",
        targetWords: { schemaVersion: 3, requestedTerms: [], usage: [], contextualTranslations: [], selectionTranslations: [] },
      },
    });
    const translate = vi.spyOn(aiService, "translateInContext").mockResolvedValue({
      selectedText: "attended",
      canonicalTerm: "attend",
      meaningVi: "tham dự",
      contextualMeaningVi: "đã tham dự",
      definitionVi: "có mặt tại một sự kiện",
      ipa: "/əˈtend/",
      partOfSpeech: "verb",
      definitionEn: "to go to an event or place",
      exampleEn: "She attended the conference.",
      exampleVi: "Cô ấy đã tham dự hội nghị.",
      cefr: "A2",
    });

    const response = await POST(new Request("http://localhost/api/stories/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storyId: story.id,
        deckId: deck.id,
        selectedText: "attended",
        surroundingSentence: "She attended the conference.",
        context: "She attended the conference.",
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      canonicalTerm: "attend",
      translation: { canonicalTerm: "attend", selectedText: "attended" },
    });
    expect(translate).toHaveBeenCalledWith(expect.objectContaining({ selectedText: "attended" }));
    await expect(storyService.findSelectionTranslation({
      storyId: story.id,
      deckId: deck.id,
      selectedText: "attended",
      surroundingSentence: "She attended the conference.",
    })).resolves.toMatchObject({ canonicalTerm: "attend" });
  });

  it("keeps the selected sentence in the Local AI request so withdrew is translated as withdrawing a proposal", async () => {
    const deck = await db.deck.create({ data: { name: "Story proposal context" } });
    deckIds.push(deck.id);
    const story = await db.story.create({
      data: {
        deckId: deck.id,
        title: "Company decision",
        content: "The company withdrew its proposal.",
        cefr: "B2",
        length: "short",
        topic: "Business",
        targetWords: { schemaVersion: 3, requestedTerms: [], usage: [], contextualTranslations: [], selectionTranslations: [] },
      },
    });
    const translate = vi.spyOn(aiService, "translateInContext").mockResolvedValue({
      selectedText: "withdrew",
      canonicalTerm: "withdraw",
      meaningVi: "rút lại",
      contextualMeaningVi: "rút lại đề xuất",
      definitionVi: "rút lại một đề xuất đã đưa ra",
      ipa: "/wɪðˈdrɔː/",
      partOfSpeech: "verb",
      definitionEn: "to take back something that was offered or proposed",
      exampleEn: "The company withdrew its proposal.",
      exampleVi: "Công ty đã rút lại đề xuất của mình.",
      cefr: "B2",
    });

    const response = await POST(new Request("http://localhost/api/stories/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storyId: story.id,
        deckId: deck.id,
        selectedText: "withdrew",
        surroundingSentence: "The company withdrew its proposal.",
        context: "The company withdrew its proposal.",
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      translation: { canonicalTerm: "withdraw", contextualMeaningVi: "rút lại đề xuất" },
    });
    expect(translate).toHaveBeenCalledWith(expect.objectContaining({
      selectedText: "withdrew",
      surroundingSentence: "The company withdrew its proposal.",
    }));
  });
});
