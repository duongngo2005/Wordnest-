import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { isCloudTtsAvailable } from "@/lib/tts/tts-runtime";

vi.mock("@/lib/tts/tts-runtime", () => ({
  isCloudTtsAvailable: vi.fn(),
}));

describe("GET /api/tts/voices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only advertises the WordNest catalog when cloud speech is configured", async () => {
    vi.mocked(isCloudTtsAvailable).mockReturnValue(false);
    const unavailable = await GET();
    await expect(unavailable.json()).resolves.toEqual({ enabled: false, voices: [] });

    vi.mocked(isCloudTtsAvailable).mockReturnValue(true);
    const available = await GET();
    const data = await available.json();
    expect(data.enabled).toBe(true);
    expect(data.voices).toHaveLength(8);
    expect(data.voices[0]).toMatchObject({ id: "wordnest:ava", name: "Ava" });
    expect(JSON.stringify(data)).not.toContain("DragonHD");
  });
});
