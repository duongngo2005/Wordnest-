import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { explainService } from "@/services/ai";

describe("POST /api/ai/explain", () => {
  it("returns 400 when input fails Zod schema validation", async () => {
    const req = new Request("http://localhost/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAnswer: "incomplete",
        // missing practiceAttemptId and sessionId/questionId
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns 200 with explanation when valid input is passed", async () => {
    vi.spyOn(explainService, "explainMistake").mockResolvedValue({
      explanation: {
        errorType: "lexical",
        misconception: "Dùng nhầm từ đồng nghĩa gần nghĩa.",
        explanation: "Từ này yêu cầu ngữ cảnh trang trọng hơn.",
        correctUsage: "They reached a consensus.",
        tip: "Nhớ consensus là sự đồng thuận chung.",
        examples: ["A broad consensus was achieved."],
      },
      cached: false,
    });

    const req = new Request("http://localhost/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        practiceAttemptId: "att-123",
        userAnswer: "agreement",
        expectedAnswer: "consensus",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.explanation.misconception).toBe("Dùng nhầm từ đồng nghĩa gần nghĩa.");
    expect(json.data.cached).toBe(false);
  });
});
