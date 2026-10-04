import { describe, expect, it, vi } from "vitest";
import { POST, GET } from "./route";
import { aiJobService } from "@/services/ai/ai-job-service";

describe("/api/ai/story-jobs", () => {
  it("returns 400 when request body is invalid", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/story-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: "" }),
      })
    );
    expect(response.status).toBe(400);
  });

  it("returns 202 Accepted and creates a background AI job", async () => {
    const createJobSpy = vi.spyOn(aiJobService, "createStoryJob").mockResolvedValue({
      id: "job-123",
      type: "story_generation",
      status: "queued",
      stage: "queued",
      progress: 0,
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
      queuePosition: 1,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    });

    try {
      const response = await POST(
        new Request("http://localhost/api/ai/story-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deckId: "deck-1",
            targetWords: ["serendipity"],
            cefr: "B1",
            length: "medium",
            topic: "Daily Life",
            narrationVoiceId: "wordnest:ava",
          }),
        })
      );

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data).toMatchObject({
        success: true,
        jobId: "job-123",
        status: "queued",
        stage: "queued",
      });
      expect(createJobSpy).toHaveBeenCalledWith(expect.objectContaining({ narrationVoiceId: "wordnest:ava" }));
    } finally {
      createJobSpy.mockRestore();
    }
  });

  it("lists active jobs via GET ?active=true", async () => {
    const listSpy = vi.spyOn(aiJobService, "getActiveAndRecentJobs").mockResolvedValue([]);
    try {
      const response = await GET(
        new Request("http://localhost/api/ai/story-jobs?active=true")
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ success: true, jobs: [] });
      expect(listSpy).toHaveBeenCalledTimes(1);
    } finally {
      listSpy.mockRestore();
    }
  });
});
