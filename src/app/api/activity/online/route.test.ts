import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { onlineActivityService } from "@/services/online-activity-service";

describe("POST /api/activity/online", () => {
  it("rejects malformed or out-of-range activity reports", async () => {
    const malformed = await POST(
      new Request("http://localhost/api/activity/online", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    );
    const excessive = await POST(
      new Request("http://localhost/api/activity/online", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seconds: 76 }),
      })
    );

    expect(malformed.status).toBe(400);
    expect(excessive.status).toBe(400);
  });

  it("persists a valid foreground activity interval", async () => {
    const record = vi.spyOn(onlineActivityService, "recordActiveSeconds").mockResolvedValue({
      date: "2026-10-18",
      activeSeconds: 60,
    });
    try {
      const response = await POST(
        new Request("http://localhost/api/activity/online", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seconds: 60 }),
        })
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
      expect(record).toHaveBeenCalledWith(60, expect.any(String));
    } finally {
      record.mockRestore();
    }
  });
});
