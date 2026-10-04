import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, DELETE } from "./route";
import { lessonService } from "@/services/vocabulary";
import { ResourceNotFoundError } from "@/lib/http/errors";

describe("Single Lesson API Routes (/api/lessons/[id])", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/lessons/[id]", () => {
    it("returns 404 when lesson does not exist", async () => {
      vi.spyOn(lessonService, "getLessonById").mockResolvedValue(null);

      const req = new Request("http://localhost/api/lessons/missing-123");
      const res = await GET(req, { params: Promise.resolve({ id: "missing-123" }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Không tìm thấy bài học");
    });

    it("returns 200 with lesson when found", async () => {
      const mockLesson = {
        id: "lesson-abc",
        deckId: "deck-1",
        title: "Team Collaboration",
        content: "Content text...",
        cefr: "B1",
        targetWords: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        deck: { id: "deck-1", name: "English" },
      };

      vi.spyOn(lessonService, "getLessonById").mockResolvedValue(mockLesson as never);

      const req = new Request("http://localhost/api/lessons/lesson-abc");
      const res = await GET(req, { params: Promise.resolve({ id: "lesson-abc" }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.lesson.id).toBe("lesson-abc");
      expect(json.lesson.title).toBe("Team Collaboration");
    });
  });

  describe("DELETE /api/lessons/[id]", () => {
    it("returns 404 when lesson to delete is not found", async () => {
      vi.spyOn(lessonService, "deleteLesson").mockRejectedValue(
        new ResourceNotFoundError("Không tìm thấy bài học.")
      );

      const req = new Request("http://localhost/api/lessons/missing-123", { method: "DELETE" });
      const res = await DELETE(req, { params: Promise.resolve({ id: "missing-123" }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("returns 200 when lesson is successfully deleted", async () => {
      vi.spyOn(lessonService, "deleteLesson").mockResolvedValue({ id: "lesson-abc" } as never);

      const req = new Request("http://localhost/api/lessons/lesson-abc", { method: "DELETE" });
      const res = await DELETE(req, { params: Promise.resolve({ id: "lesson-abc" }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("Đã xóa bài học");
    });
  });
});
