import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { db } from "@/lib/db";
import { aiJobService } from "@/services/ai/ai-job-service";
import { lessonService } from "@/services/vocabulary";

describe("Decks Lessons API Routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/decks/[id]/lessons", () => {
    it("returns list of lessons for a deck", async () => {
      const mockLessons = [
        {
          id: "lesson-1",
          deckId: "deck-123",
          title: "Workplace Routine",
          content: "Text...",
          cefr: "B1",
          targetWords: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.spyOn(lessonService, "getLessonsByDeckId").mockResolvedValue(mockLessons as never);

      const req = new Request("http://localhost/api/decks/deck-123/lessons");
      const res = await GET(req, { params: Promise.resolve({ id: "deck-123" }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.lessons.length).toBe(1);
      expect(json.lessons[0].id).toBe("lesson-1");
    });
  });

  describe("POST /api/decks/[id]/lessons", () => {
    it("rejects empty targetWords with 400", async () => {
      const req = new Request("http://localhost/api/decks/deck-123/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetWords: [] }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "deck-123" }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("ít nhất 1 từ");
    });

    it("rejects more than 20 targetWords with 400", async () => {
      const targetWords = Array.from({ length: 25 }, (_, i) => `word-${i}`);
      const req = new Request("http://localhost/api/decks/deck-123/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetWords }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "deck-123" }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("tối đa 20 từ");
    });

    it("returns 404 when deck is not found", async () => {
      vi.spyOn(db.deck, "findUnique").mockResolvedValue(null);

      const req = new Request("http://localhost/api/decks/missing-deck/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetWords: ["word-1"] }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "missing-deck" }) });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Không tìm thấy bộ thẻ");
    });

    it("enqueues lesson job and returns 202 when input is valid and deck exists", async () => {
      vi.spyOn(db.deck, "findUnique").mockResolvedValue({ id: "deck-123" } as never);

      const mockJob = {
        id: "job-lesson-1",
        type: "lesson_generation" as const,
        status: "queued" as const,
        stage: "queued" as const,
        progress: 0,
        queuePosition: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(aiJobService, "createLessonJob").mockResolvedValue(mockJob as never);

      const req = new Request("http://localhost/api/decks/deck-123/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetWords: ["word-1", "word-2"],
          cefr: "B2",
          topic: "Business Presentation",
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "deck-123" }) });
      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.jobId).toBe("job-lesson-1");
    });
  });
});
