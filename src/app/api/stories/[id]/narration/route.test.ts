import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { storyService } from "@/services/vocabulary";
import { isCloudTtsAvailable } from "@/lib/tts/tts-runtime";

vi.mock("@/services/vocabulary", () => ({
  storyService: { prepareStoryNarration: vi.fn() },
}));
vi.mock("@/lib/tts/tts-runtime", () => ({ isCloudTtsAvailable: vi.fn() }));

describe("POST /api/stories/[id]/narration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCloudTtsAvailable).mockReturnValue(true);
  });

  it("rejects an unknown voice without creating audio", async () => {
    const response = await POST(
      new Request("http://localhost/api/stories/story-1/narration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: "device:voice" }),
      }),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(response.status).toBe(400);
    expect(storyService.prepareStoryNarration).not.toHaveBeenCalled();
  });

  it("materializes the selected curated voice for this Story", async () => {
    vi.mocked(storyService.prepareStoryNarration).mockResolvedValue({ voiceIds: ["wordnest:ava"] });

    const response = await POST(
      new Request("http://localhost/api/stories/story-1/narration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: "wordnest:ava" }),
      }),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(response.status).toBe(200);
    expect(storyService.prepareStoryNarration).toHaveBeenCalledWith("story-1", "wordnest:ava");
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      narration: { voiceIds: ["wordnest:ava"] },
    });
  });
});
