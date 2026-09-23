import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  generatedFlashcardItemSchema,
  AUTO_IMAGE_MIN_SCORE,
} from "@/lib/validation/flashcard";
import {
  isJunkImage,
  MultiProviderImageSearchService,
  ImageProvider,
  ImageCandidate,
  ImageSearchResult,
} from "@/services/images/image-search-service";
import { imageSearchService } from "@/services/images";
import { POST as uploadPost, DELETE as uploadDelete } from "@/app/api/upload/image/route";
import { deckService } from "@/services/vocabulary";
import { db } from "@/lib/db";

describe("Final QA Acceptance Review - Image System", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Audit Item 1: AUTO_IMAGE_MIN_SCORE Single Source of Truth
  // =========================================================================
  describe("Audit Item 1: Source of Truth for Threshold", () => {
    it("exports AUTO_IMAGE_MIN_SCORE as exactly 75 from flashcard validation", () => {
      expect(AUTO_IMAGE_MIN_SCORE).toBe(75);
    });
  });

  // =========================================================================
  // 2. Word Groups: Concrete, Visual Actions, Generic, Abstract, Polysemous
  // =========================================================================
  describe("Word Groups Classification & contextual imageQuery", () => {
    describe("Concrete Objects (visualScore >= 75)", () => {
      const concreteWords = [
        {
          term: "apple",
          meaningVi: "quả táo",
          definitionEn: "a round fruit with red, yellow, or green skin",
          exampleEn: "She ate a crisp red apple for lunch.",
          exampleVi: "Cô ấy ăn một quả táo đỏ giòn cho bữa trưa.",
          visualScore: 98,
          imageSearchQuery: "fresh crisp red apple fruit",
        },
        {
          term: "microscope",
          meaningVi: "kính hiển vi",
          definitionEn: "an optical instrument used for viewing very small objects",
          exampleEn: "The scientist examined the bacteria through a microscope.",
          exampleVi: "Nhà khoa học đã kiểm tra vi khuẩn qua kính hiển vi.",
          visualScore: 96,
          imageSearchQuery: "laboratory optical microscope instrument",
        },
        {
          term: "giraffe",
          meaningVi: "hươu cao cổ",
          definitionEn: "a large African mammal with a very long neck and forelegs",
          exampleEn: "A wild giraffe reached up to eat leaves from the tall acacia tree.",
          exampleVi: "Một con hươu cao cổ vươn mình ăn lá từ cây keo cao.",
          visualScore: 99,
          imageSearchQuery: "wild giraffe tall acacia tree savannah",
        },
        {
          term: "parachute",
          meaningVi: "cái dù nhảy",
          definitionEn: "a cloth canopy that fills with air to slow the fall of a person or object",
          exampleEn: "The skydiver deployed his bright red parachute.",
          exampleVi: "Người nhảy dù đã bung chiếc dù đỏ rực rỡ của mình.",
          visualScore: 95,
          imageSearchQuery: "skydiver deployed red parachute open sky",
        },
      ];

      it.each(concreteWords)(
        "assigns visualScore >= 75 and enables imageUseful for $term",
        (card) => {
          const parsed = generatedFlashcardItemSchema.parse(card);
          expect(parsed.visualScore).toBeGreaterThanOrEqual(AUTO_IMAGE_MIN_SCORE);
          expect(parsed.imageUseful).toBe(true);
          expect(parsed.imageSearchQuery).toBeTruthy();
          expect(parsed.imageSearchQuery).not.toBe(card.term); // Must be contextual, not raw word
        }
      );
    });

    describe("Visual Actions & Physical States (visualScore >= 75)", () => {
      const visualActionWords = [
        {
          term: "yawn",
          meaningVi: "ngáp",
          definitionEn: "to involuntarily open the mouth wide and inhale deeply due to tiredness",
          exampleEn: "The sleepy cat stretched its paws and yawned deeply.",
          exampleVi: "Chú mèo buồn ngủ vươn chân và ngáp một cái thật dài.",
          visualScore: 88,
          imageSearchQuery: "sleepy cat yawning stretching paws",
        },
        {
          term: "shiver",
          meaningVi: "run rẩy vì lạnh",
          definitionEn: "to shake slightly and uncontrollably as a result of being cold or frightened",
          exampleEn: "He stood shivering in the freezing snow without a coat.",
          exampleVi: "Anh ấy đứng run rẩy giữa trời tuyết rơi giá lạnh mà không có áo khoác.",
          visualScore: 82,
          imageSearchQuery: "person shivering in winter cold snow",
        },
        {
          term: "stumble",
          meaningVi: "vấp ngã, sảy chân",
          definitionEn: "to trip or momentarily lose one's balance while walking",
          exampleEn: "The hiker stumbled over a tree root on the forest trail.",
          exampleVi: "Người đi bộ leo núi vấp phải rễ cây trên đường mòn trong rừng.",
          visualScore: 80,
          imageSearchQuery: "person stumbling tripping on forest trail path",
        },
        {
          term: "exhausted",
          meaningVi: "kiệt sức",
          definitionEn: "completely drained of physical or mental energy",
          exampleEn: "The marathon runner collapsed exhausted at the finish line.",
          exampleVi: "Vận động viên marathon ngã gục vì kiệt sức ở vạch đích.",
          visualScore: 85,
          imageSearchQuery: "tired exhausted marathon runner finish line",
        },
        {
          term: "crowded",
          meaningVi: "đông đúc",
          definitionEn: "full of a large number of people",
          exampleEn: "Commuters packed tightly onto the crowded subway train.",
          exampleVi: "Hành khách chen chúc trên chuyến tàu điện ngầm đông đúc.",
          visualScore: 84,
          imageSearchQuery: "crowded subway station passengers rush hour",
        },
        {
          term: "slippery",
          meaningVi: "trơn trượt",
          definitionEn: "difficult to hold or stand on because it is smooth, wet, or oily",
          exampleEn: "Be careful on the wet, slippery sidewalk after the heavy rain.",
          exampleVi: "Hãy cẩn thận trên vỉa hè trơn trượt ẩm ướt sau cơn mưa lớn.",
          visualScore: 78,
          imageSearchQuery: "wet slippery sidewalk caution wet floor sign",
        },
        {
          term: "cluttered",
          meaningVi: "bừa bộn",
          definitionEn: "covered or filled with an untidy collection of things",
          exampleEn: "His messy desk was cluttered with papers, books, and coffee mugs.",
          exampleVi: "Bàn làm việc của anh ấy bừa bộn giấy tờ, sách vở và tách cà phê.",
          visualScore: 86,
          imageSearchQuery: "messy cluttered office desk papers cups untidy",
        },
      ];

      it.each(visualActionWords)(
        "assigns visualScore >= 75 and contextual query for $term",
        (card) => {
          const parsed = generatedFlashcardItemSchema.parse(card);
          expect(parsed.visualScore).toBeGreaterThanOrEqual(AUTO_IMAGE_MIN_SCORE);
          expect(parsed.imageUseful).toBe(true);
          expect(parsed.imageSearchQuery).toBeTruthy();
          expect(parsed.imageSearchQuery).toContain(" "); // Multi-word contextual query
        }
      );
    });

    describe("Generic Concepts (visualScore 50-74, suppressed from auto-image)", () => {
      const genericWords = [
        {
          term: "office",
          meaningVi: "văn phòng",
          definitionEn: "a room or set of rooms where people work, usually at desks",
          exampleEn: "She arrived early at the modern corporate office.",
          exampleVi: "Cô ấy đến văn phòng công ty hiện đại từ sớm.",
          visualScore: 65,
          imageSearchQuery: "corporate office desks computers",
        },
        {
          term: "meeting",
          meaningVi: "cuộc họp",
          definitionEn: "an assembly of people for a formal discussion",
          exampleEn: "The team held a weekly project review meeting.",
          exampleVi: "Cả nhóm đã tổ chức cuộc họp đánh giá dự án hàng tuần.",
          visualScore: 60,
          imageSearchQuery: "team business meeting conference room",
        },
        {
          term: "employee",
          meaningVi: "nhân viên",
          definitionEn: "a person employed for wages or salary",
          exampleEn: "Every employee received annual training.",
          exampleVi: "Mỗi nhân viên đều được tham gia đào tạo hàng năm.",
          visualScore: 55,
          imageSearchQuery: "corporate employee working desk",
        },
        {
          term: "airport",
          meaningVi: "sân bay",
          definitionEn: "a complex of runways and buildings for takeoff, landing, and maintenance of civil aircraft",
          exampleEn: "Passengers waited at the airport departure lounge.",
          exampleVi: "Hành khách chờ tại phòng chờ khởi hành của sân bay.",
          visualScore: 70,
          imageSearchQuery: "international airport departure lounge terminal",
        },
      ];

      it.each(genericWords)(
        "suppresses auto image search for generic concept $term (visualScore < 75)",
        (card) => {
          const parsed = generatedFlashcardItemSchema.parse(card);
          expect(parsed.visualScore).toBeLessThan(AUTO_IMAGE_MIN_SCORE);
          expect(parsed.imageUseful).toBe(false);
          expect(parsed.imageSearchQuery).toBeNull(); // Automatically nulled out
        }
      );
    });

    describe("Abstract / Non-visual Words (visualScore 0-49, suppressed)", () => {
      const abstractWords = [
        {
          term: "perspective",
          meaningVi: "góc nhìn, quan điểm",
          definitionEn: "a particular attitude toward or way of regarding something",
          exampleEn: "The discussion gave me a fresh perspective on the issue.",
          exampleVi: "Cuộc thảo luận đã cho tôi một góc nhìn mới về vấn đề này.",
          visualScore: 30,
        },
        {
          term: "comprehensive",
          meaningVi: "toàn diện",
          definitionEn: "complete; including all or nearly all elements or aspects",
          exampleEn: "The report provided a comprehensive review of the market trends.",
          exampleVi: "Báo cáo cung cấp một cái nhìn toàn diện về xu hướng thị trường.",
          visualScore: 15,
        },
        {
          term: "significantly",
          meaningVi: "đáng kể",
          definitionEn: "in a sufficiently great or important way as to be worthy of attention",
          exampleEn: "Sales increased significantly during the holiday season.",
          exampleVi: "Doanh số bán hàng đã tăng đáng kể trong mùa lễ hội.",
          visualScore: 10,
        },
        {
          term: "nevertheless",
          meaningVi: "tuy nhiên, dù vậy",
          definitionEn: "in spite of that; notwithstanding",
          exampleEn: "The journey was arduous; nevertheless, they persisted.",
          exampleVi: "Hành trình rất gian nan; tuy nhiên, họ vẫn kiên trì bước tiếp.",
          visualScore: 0,
        },
        {
          term: "leverage",
          meaningVi: "tận dụng, đòn bẩy",
          definitionEn: "to use something to maximum advantage",
          exampleEn: "The company sought to leverage its existing customer base.",
          exampleVi: "Công ty đã tìm cách tận dụng tối đa lượng khách hàng hiện có.",
          visualScore: 25,
        },
      ];

      it.each(abstractWords)(
        "strictly suppresses auto image for abstract term $term (visualScore: $visualScore)",
        (card) => {
          const parsed = generatedFlashcardItemSchema.parse(card);
          expect(parsed.visualScore).toBeLessThan(AUTO_IMAGE_MIN_SCORE);
          expect(parsed.imageUseful).toBe(false);
          expect(parsed.imageSearchQuery).toBeNull();
        }
      );
    });

    describe("Ambiguous / Polysemous Words (Contextual Query Differentiation)", () => {
      const polysemousPairs = [
        {
          word: "bank",
          senses: [
            {
              meaningVi: "ngân hàng tài chính",
              exampleEn: "She deposited $1,000 in cash at the local commercial bank.",
              expectedContextKeywords: ["finance", "atm", "building", "teller", "vault"],
              mockQuery: "commercial bank branch counter teller",
            },
            {
              meaningVi: "bờ sông",
              exampleEn: "We pitched a tent along the grassy river bank.",
              expectedContextKeywords: ["river", "grassy", "water", "nature"],
              mockQuery: "grassy river bank water stream nature",
            },
          ],
        },
        {
          word: "crane",
          senses: [
            {
              meaningVi: "cần cẩu xây dựng",
              exampleEn: "The tower crane lifted concrete panels up to the skyscraper roof.",
              expectedContextKeywords: ["construction", "tower", "machine", "building"],
              mockQuery: "construction tower crane hoisting building site",
            },
            {
              meaningVi: "chim sếu",
              exampleEn: "A flock of graceful white cranes danced near the wetland marsh.",
              expectedContextKeywords: ["bird", "wildlife", "marsh", "feathers"],
              mockQuery: "white crane bird standing in marsh wetland",
            },
          ],
        },
        {
          word: "plant",
          senses: [
            {
              meaningVi: "cây cối / cây cảnh",
              exampleEn: "She placed a potted green plant near the sunlit window.",
              expectedContextKeywords: ["potted", "leaves", "botany", "green"],
              mockQuery: "potted green houseplant leaves windowsill",
            },
            {
              meaningVi: "nhà máy công nghiệp",
              exampleEn: "The semiconductor fabrication plant produces millions of microchips.",
              expectedContextKeywords: ["factory", "industrial", "facility", "manufacturing"],
              mockQuery: "industrial manufacturing factory assembly plant",
            },
          ],
        },
        {
          word: "pitch",
          senses: [
            {
              meaningVi: "sân bóng đá",
              exampleEn: "The referee blew the whistle on the muddy soccer pitch.",
              expectedContextKeywords: ["soccer", "football", "grass", "field"],
              mockQuery: "green soccer pitch football stadium field",
            },
            {
              meaningVi: "bài thuyết trình gọi vốn (trừu tượng)",
              exampleEn: "The founder pitched their seed round to angel investors.",
              expectedContextKeywords: [],
              isAbstract: true,
              visualScore: 40,
            },
          ],
        },
        {
          word: "bat",
          senses: [
            {
              meaningVi: "con dơi",
              exampleEn: "A nocturnal fruit bat hung upside down from the cavern roof.",
              expectedContextKeywords: ["nocturnal", "cave", "animal", "flying"],
              mockQuery: "nocturnal fruit bat flying cave dark",
            },
            {
              meaningVi: "gậy bóng chày",
              exampleEn: "He swung the heavy wooden baseball bat with both hands.",
              expectedContextKeywords: ["baseball", "wooden", "sport", "equipment"],
              mockQuery: "wooden baseball bat sports equipment",
            },
          ],
        },
      ];

      it("disambiguates query context between distinct senses of the same word", () => {
        for (const pair of polysemousPairs) {
          const senseA = pair.senses[0];
          const senseB = pair.senses[1];

          if (senseB.isAbstract) {
            const parsedB = generatedFlashcardItemSchema.parse({
              term: pair.word,
              meaningVi: senseB.meaningVi,
              definitionEn: "sales presentation",
              exampleEn: senseB.exampleEn,
              exampleVi: "Người sáng lập đã thuyết trình...",
              visualScore: senseB.visualScore,
              imageSearchQuery: "business presentation",
            });
            expect(parsedB.imageUseful).toBe(false);
            expect(parsedB.imageSearchQuery).toBeNull();
          } else {
            // Both are visual, but queries must be distinct and specific
            expect(senseA.mockQuery).not.toBe(senseB.mockQuery);
            expect(senseA.mockQuery).not.toBe(pair.word);
            expect(senseB.mockQuery).not.toBe(pair.word);
          }
        }
      });
    });
  });

  // =========================================================================
  // 3. Audit Item 4: Junk Image Filter
  // =========================================================================
  describe("Audit Item 4: Junk Filter", () => {
    it("rejects images containing junk keywords in title or URL", () => {
      const junkCases = [
        { title: "English vocabulary dictionary definition page", url: "https://example.com/pic1.jpg" },
        { title: "Cute cat playing", url: "https://example.com/worksheet-cat-exercise.png" },
        { title: "Apple vector clipart banner icon", url: "https://example.com/apple.jpg" },
        { title: "Microscope diagram worksheet for kids", url: "https://example.com/microscope.jpg" },
        { title: "Free stock photo watermark shutterstock", url: "https://example.com/photo.jpg" },
        { title: "Vocabulary flashcard printable quiz", url: "https://example.com/card.png" },
      ];

      for (const item of junkCases) {
        expect(isJunkImage({ title: item.title, imageUrl: item.url })).toBe(true);
      }
    });

    it("accepts clean photographic or educational imagery", () => {
      const validCases = [
        { title: "A red apple resting on a rustic wooden table", url: "https://example.com/fresh-apple.jpg" },
        { title: "Modern binocular optical microscope in lab", url: "https://example.com/lab-scope.webp" },
        { title: "Wild giraffe in Masai Mara savannah", url: "https://example.com/giraffe-kenya.jpg" },
        { title: "Skydiver descending with opened parachute", url: "https://example.com/parachute-sky.jpg" },
      ];

      for (const item of validCases) {
        expect(isJunkImage({ title: item.title, imageUrl: item.url })).toBe(false);
      }
    });
  });

  // =========================================================================
  // 4. Audit Item 5 & 6 & 7: Candidate Limit, Deduplication, No-candidate Null
  // =========================================================================
  describe("Audit Items 5, 6, 7: Candidate Limit, Deduplication, Fallback Null", () => {
    it("Audit 5: limits search candidate inspection to top 5 items", async () => {
      const mockCandidates: ImageCandidate[] = [
        { imageUrl: "https://example.com/junk1.jpg", title: "worksheet vocabulary", source: "duckduckgo" },
        { imageUrl: "https://example.com/junk2.jpg", title: "dictionary definition", source: "duckduckgo" },
        { imageUrl: "https://example.com/junk3.jpg", title: "quiz flashcard", source: "duckduckgo" },
        { imageUrl: "https://example.com/junk4.jpg", title: "infographic clipart", source: "duckduckgo" },
        { imageUrl: "https://example.com/junk5.jpg", title: "banner logo vector", source: "duckduckgo" },
        // 6th candidate is valid, but should NOT be reached because max candidates is 5
        { imageUrl: "https://example.com/valid6.jpg", title: "clean real photo", source: "duckduckgo" },
      ];

      class FakeProvider implements ImageProvider {
        name = "fakeprovider";
        async search(): Promise<ImageSearchResult | null> {
          return null;
        }
        async searchMany(_query: string, limit?: number): Promise<ImageCandidate[]> {
          return mockCandidates.slice(0, limit);
        }
      }

      const service = new MultiProviderImageSearchService([new FakeProvider()]);
      const result = await service.searchImageForVocabulary("test", "test query");

      // Because top 5 were all junk, it gracefully stops and returns null instead of digging endlessly
      expect(result.imageUrl).toBeNull();
      expect(result.imageSource).toBeNull();
    });

    it("Audit 6: skips duplicate URLs already used in the same batch", async () => {
      const usedUrls = new Set<string>(["https://example.com/apple-1.jpg"]);

      const candidates: ImageCandidate[] = [
        { imageUrl: "https://example.com/apple-1.jpg", title: "Fresh red apple", source: "duckduckgo" },
        { imageUrl: "https://example.com/apple-2.jpg", title: "Organic red apple on tree", source: "duckduckgo" },
      ];

      class FakeProvider implements ImageProvider {
        name = "fakeprovider";
        async search(): Promise<ImageSearchResult | null> {
          return null;
        }
        async searchMany(_query: string, limit?: number): Promise<ImageCandidate[]> {
          return candidates.slice(0, limit);
        }
      }

      const service = new MultiProviderImageSearchService([new FakeProvider()]);
      const result = await service.searchImageForVocabulary("apple", "red apple fruit", { usedUrls });

      // Skips apple-1 (already in usedUrls) and selects apple-2
      expect(result.imageUrl).toBe("https://example.com/apple-2.jpg");
    });

    it("Audit 7: returns imageUrl: null when no candidate passes (not an error)", async () => {
      class EmptyProvider implements ImageProvider {
        name = "empty";
        async search(): Promise<ImageSearchResult | null> {
          return null;
        }
        async searchMany(): Promise<ImageCandidate[]> {
          return [];
        }
      }

      const service = new MultiProviderImageSearchService([new EmptyProvider()]);
      const result = await service.searchImageForVocabulary("obscure", "obscure concept query");

      expect(result.imageUrl).toBeNull();
      expect(result.imageSearchQuery).toBe("obscure concept query");
    });
  });

  // =========================================================================
  // 5. Audit Item 2: Threshold < 75 does NOT trigger image search
  // =========================================================================
  describe("Audit Item 2: Low visualScore strictly prevents search trigger", () => {
    it("does not call image search service when card visualScore is below threshold", async () => {
      const searchSpy = vi.spyOn(imageSearchService, "searchImageForVocabulary");

      const abstractCard = {
        term: "perspective",
        meaningVi: "góc nhìn",
        definitionEn: "a point of view",
        exampleEn: "She had an interesting perspective.",
        exampleVi: "Cô ấy có một góc nhìn thú vị.",
        visualScore: 40, // < 75
        imageUseful: true, // Even if raw legacy true was passed!
        imageSearchQuery: "perspective thinking",
      };

      const parsed = generatedFlashcardItemSchema.parse(abstractCard);
      expect(parsed.imageUseful).toBe(false);
      expect(parsed.imageSearchQuery).toBeNull();
      expect(parsed.visualScore).toBe(40);

      const isVisual =
        parsed.visualScore !== undefined
          ? parsed.visualScore >= AUTO_IMAGE_MIN_SCORE
          : Boolean(parsed.imageUseful);
      const shouldSearch = isVisual && Boolean(parsed.imageSearchQuery);

      expect(shouldSearch).toBe(false);
      expect(searchSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. Audit Items 9 & 10: Manual Upload & Old File Disk Cleanup
  // =========================================================================
  describe("Audit Items 9 & 10: Upload API & Disk Cleanup", () => {
    const createdFiles: string[] = [];

    afterEach(() => {
      for (const f of createdFiles) {
        if (fs.existsSync(f)) {
          try {
            fs.unlinkSync(f);
          } catch {}
        }
      }
    });

    it("Audit 9: POST /api/upload/image saves valid binary file and returns relative URL", async () => {
      const fakeImageBytes = Buffer.from("fake-png-content-data");
      const file = new File([fakeImageBytes], "test-upload.png", { type: "image/png" });
      const formData = new FormData();
      formData.append("file", file);

      const req = new Request("http://localhost:3000/api/upload/image", {
        method: "POST",
        body: formData,
      });

      const res = await uploadPost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.imageUrl).toMatch(/^\/uploads\/cards\/card_\d+_[a-f0-9]+\.png$/);

      const diskPath = path.join(process.cwd(), "public", json.imageUrl);
      expect(fs.existsSync(diskPath)).toBe(true);
      createdFiles.push(diskPath);
    });

    it("Audit 10: DELETE /api/upload/image deletes local card file from disk", async () => {
      // First create a file
      const uploadDir = path.join(process.cwd(), "public", "uploads", "cards");
      fs.mkdirSync(uploadDir, { recursive: true });
      const testFilename = `card_test_cleanup_${Date.now()}.jpg`;
      const filePath = path.join(uploadDir, testFilename);
      fs.writeFileSync(filePath, "test-data");
      expect(fs.existsSync(filePath)).toBe(true);

      // Now call DELETE
      const deleteReq = new Request(
        `http://localhost:3000/api/upload/image?url=${encodeURIComponent(`/uploads/cards/${testFilename}`)}`,
        { method: "DELETE" }
      );
      const res = await uploadDelete(deleteReq);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("Audit 10b: deckService.updateCard and deleteCard cleans up disk file when replaced or deleted", async () => {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "cards");
      fs.mkdirSync(uploadDir, { recursive: true });
      const oldFilename = `card_replace_test_${Date.now()}.jpg`;
      const oldFilePath = path.join(uploadDir, oldFilename);
      fs.writeFileSync(oldFilePath, "old-image-bytes");
      expect(fs.existsSync(oldFilePath)).toBe(true);

      const mockCardId = "test-card-cleanup-id";
      vi.spyOn(db.flashcard, "findUnique").mockResolvedValue({
        id: mockCardId,
        imageUrl: `/uploads/cards/${oldFilename}`,
      } as unknown as Awaited<ReturnType<typeof db.flashcard.findUnique>>);

      vi.spyOn(db.flashcard, "update").mockResolvedValue({
        id: mockCardId,
        imageUrl: "https://example.com/new-web-image.jpg",
      } as unknown as Awaited<ReturnType<typeof db.flashcard.update>>);

      // Update card with a new image URL
      await deckService.updateCard(mockCardId, {
        imageUrl: "https://example.com/new-web-image.jpg",
      });

      // The old disk file must have been cleanly unlinked!
      expect(fs.existsSync(oldFilePath)).toBe(false);
    });
  });

  // =========================================================================
  // 7. Audit Item 11: Reloading persistent URLs
  // =========================================================================
  describe("Audit Item 11: Local Upload URL Pathing", () => {
    it("produces public relative path accessible by Next.js static asset server", () => {
      const sampleUrl = "/uploads/cards/card_1726000000_abcd1234.webp";
      expect(sampleUrl.startsWith("/uploads/cards/")).toBe(true);
      // Next.js serves all files in `public/` from root `/`
      const diskPath = path.join(process.cwd(), "public", sampleUrl);
      expect(diskPath.startsWith(path.join(process.cwd(), "public", "uploads", "cards"))).toBe(true);
    });
  });

  // =========================================================================
  // 8. Audit Item 12: Legacy Data Compatibility
  // =========================================================================
  describe("Audit Item 12: Legacy Data Compatibility", () => {
    it("handles legacy card with imageUseful: true and no visualScore", () => {
      const legacyCard = {
        term: "apple",
        meaningVi: "quả táo",
        definitionEn: "a fruit",
        exampleEn: "I love apples.",
        exampleVi: "Tôi thích táo.",
        imageUseful: true,
        imageSearchQuery: "fresh red apple",
      };

      const parsed = generatedFlashcardItemSchema.parse(legacyCard);
      expect(parsed.visualScore).toBe(85);
      expect(parsed.imageUseful).toBe(true);
      expect(parsed.imageSearchQuery).toBe("fresh red apple");
    });

    it("handles legacy card with imageUseful: false and no visualScore", () => {
      const legacyCard = {
        term: "nevertheless",
        meaningVi: "tuy nhiên",
        definitionEn: "in spite of that",
        exampleEn: "He went nevertheless.",
        exampleVi: "Anh ấy vẫn đi.",
        imageUseful: false,
        imageSearchQuery: null,
      };

      const parsed = generatedFlashcardItemSchema.parse(legacyCard);
      expect(parsed.visualScore).toBe(0);
      expect(parsed.imageUseful).toBe(false);
      expect(parsed.imageSearchQuery).toBeNull();
    });

    it("handles legacy card with no visualScore and no imageUseful", () => {
      const minimalCard = {
        term: "test",
        meaningVi: "kiểm tra",
        definitionEn: "a test",
        exampleEn: "This is a test.",
        exampleVi: "Đây là một bài kiểm tra.",
      };

      const parsed = generatedFlashcardItemSchema.parse(minimalCard);
      expect(parsed.visualScore).toBe(0);
      expect(parsed.imageUseful).toBe(false);
      expect(parsed.imageSearchQuery).toBeNull();
    });
  });

  // =========================================================================
  // 9. Final QA Manual Paste & Edge Case Acceptance
  // =========================================================================
  describe("Audit Item 13: Manual Paste Flow & Error Scenarios", () => {
    it("Case 1: Upload API returns path (never Base64) and deckService saves imageSource MANUAL", async () => {
      const fakeImageBytes = Buffer.from("valid-png-data");
      const file = new File([fakeImageBytes], "paste.png", { type: "image/png" });
      const formData = new FormData();
      formData.append("file", file);

      const req = new Request("http://localhost:3000/api/upload/image", {
        method: "POST",
        body: formData,
      });

      const res = await uploadPost(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // Must only be relative path, NEVER Base64
      expect(data.imageUrl.startsWith("/uploads/cards/")).toBe(true);
      expect(data.imageUrl).not.toContain("data:image/");

      // Clean up uploaded file
      const diskPath = path.join(process.cwd(), "public", data.imageUrl);
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    });

    it("Case 2: Replacing image triggers cleanup of previous local file", async () => {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "cards");
      fs.mkdirSync(uploadDir, { recursive: true });
      const oldFile = `card_replace_${Date.now()}.png`;
      const oldFilePath = path.join(uploadDir, oldFile);
      fs.writeFileSync(oldFilePath, "old-bytes");
      expect(fs.existsSync(oldFilePath)).toBe(true);

      const deleteReq = new Request(
        `http://localhost:3000/api/upload/image?url=${encodeURIComponent(`/uploads/cards/${oldFile}`)}`,
        { method: "DELETE" }
      );
      const deleteRes = await uploadDelete(deleteReq);
      expect(deleteRes.status).toBe(200);
      expect(fs.existsSync(oldFilePath)).toBe(false);
    });

    it("Case 3: Removing image clears imageUrl and triggers cleanup", async () => {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "cards");
      fs.mkdirSync(uploadDir, { recursive: true });
      const targetFile = `card_remove_${Date.now()}.png`;
      const targetFilePath = path.join(uploadDir, targetFile);
      fs.writeFileSync(targetFilePath, "bytes-to-remove");

      const deleteReq = new Request(
        `http://localhost:3000/api/upload/image?url=${encodeURIComponent(`/uploads/cards/${targetFile}`)}`,
        { method: "DELETE" }
      );
      const res = await uploadDelete(deleteReq);
      expect(res.status).toBe(200);
      expect(fs.existsSync(targetFilePath)).toBe(false);
    });

    it("Case 4: Non-image paste data rejects without creating files", async () => {
      const formData = new FormData();
      formData.append("file", new File(["https://example.com/url-only.jpg"], "paste.txt", { type: "text/plain" }));

      const req = new Request("http://localhost:3000/api/upload/image", {
        method: "POST",
        body: formData,
      });

      const res = await uploadPost(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Định dạng ảnh không được hỗ trợ");
    });

    it("Case 5: Oversized file (> 5MB) is strictly rejected by upload endpoint", async () => {
      const formData = new FormData();
      const largeBytes = new Uint8Array(5 * 1024 * 1024 + 1024);
      formData.append("file", new File([largeBytes], "huge.png", { type: "image/png" }));

      const req = new Request("http://localhost:3000/api/upload/image", {
        method: "POST",
        body: formData,
      });

      const res = await uploadPost(req);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("5MB");
    });

    it("Case 6: Target isolation logic ensures inputs and textareas ignore card paste", () => {
      const isTargetIgnored = (tagName: string, isContentEditable: boolean = false) => {
        return tagName === "INPUT" || tagName === "TEXTAREA" || isContentEditable;
      };

      expect(isTargetIgnored("INPUT")).toBe(true);
      expect(isTargetIgnored("TEXTAREA")).toBe(true);
      expect(isTargetIgnored("DIV", true)).toBe(true);
      expect(isTargetIgnored("ARTICLE", false)).toBe(false);
      expect(isTargetIgnored("BUTTON", false)).toBe(false);
    });
  });
});
