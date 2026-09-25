import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { getTtsService, isCloudTtsAvailable } from "@/lib/tts/tts-runtime";

vi.mock("@/lib/tts/tts-runtime", () => ({
  getTtsService: vi.fn(),
  isCloudTtsAvailable: vi.fn(),
}));

describe("/api/tts", () => {
  const synthesize = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCloudTtsAvailable).mockReturnValue(true);
    vi.mocked(getTtsService).mockReturnValue({ synthesize });
  });

  it("rejects missing text, oversized text, and an uncurated voice", async () => {
    const requests = [
      new Request("http://localhost/api/tts?voice=wordnest:ava"),
      new Request(`http://localhost/api/tts?text=${"a".repeat(601)}&voice=wordnest:ava`),
      new Request("http://localhost/api/tts?text=hello&voice=en-US-Ava:DragonHDLatestNeural"),
    ];

    for (const request of requests) {
      const response = await GET(request);
      expect(response.status).toBe(400);
    }
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("handles missing credentials without becoming a generic cloud proxy", async () => {
    vi.mocked(isCloudTtsAvailable).mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/tts?text=hello&voice=wordnest:ava"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Giọng WordNest hiện chưa sẵn sàng." });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("returns playable MP3 bytes for a valid curated cloud voice", async () => {
    synthesize.mockResolvedValueOnce(new Uint8Array([73, 68, 51, 4]).buffer);

    const response = await POST(
      new Request("http://localhost/api/tts", {
        method: "POST",
        body: JSON.stringify({ text: "Small steps", voice: "wordnest:ava" }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([73, 68, 51, 4]));
    expect(synthesize).toHaveBeenCalledWith({ text: "Small steps", voiceId: "wordnest:ava" });
  });

  it("returns a concise retry-safe response when cloud synthesis fails", async () => {
    synthesize.mockRejectedValueOnce(new Error("provider quota response"));

    const response = await GET(new Request("http://localhost/api/tts?text=hello&voice=wordnest:ava"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Không thể tạo âm thanh WordNest lúc này." });
  });
});
