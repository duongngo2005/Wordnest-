import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/decks/[id]/cards/ai", () => {
  it("is retired and cannot enqueue or persist Local AI flashcard drafts", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "AI_FLASHCARD_GENERATION_RETIRED",
    });
  });
});
