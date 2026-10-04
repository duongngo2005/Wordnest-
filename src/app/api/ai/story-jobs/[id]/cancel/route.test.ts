import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { aiJobService } from "@/services/ai/ai-job-service";

describe("POST /api/ai/story-jobs/[id]/cancel", () => {
  it("cancels an active job", async () => {
    const cancelSpy = vi.spyOn(aiJobService, "cancelJob").mockResolvedValue({
      success: true,
      message: "Đã hủy tác vụ.",
    });

    const response = await POST(new Request("http://localhost/api/ai/story-jobs/job-1/cancel", { method: "POST" }), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(cancelSpy).toHaveBeenCalledWith("job-1");
  });
});
