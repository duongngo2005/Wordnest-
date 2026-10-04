import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { aiJobService } from "@/services/ai/ai-job-service";

describe("GET /api/ai/story-jobs/[id]", () => {
  it("returns 404 when job does not exist", async () => {
    vi.spyOn(aiJobService, "getJob").mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/ai/story-jobs/job-999"), {
      params: Promise.resolve({ id: "job-999" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns job details when found", async () => {
    vi.spyOn(aiJobService, "getJob").mockResolvedValue({
      id: "job-1",
      type: "story_generation",
      status: "running",
      stage: "generating_story",
      progress: 10,
      input: {
        deckId: "deck-1",
        targetWords: ["serendipity"],
        cefr: "B1",
        length: "medium",
        topic: "Daily Life",
      },
      resultId: null,
      resultUrl: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
    });

    const response = await GET(new Request("http://localhost/api/ai/story-jobs/job-1"), {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.job.id).toBe("job-1");
    expect(data.job.status).toBe("running");
  });
});
