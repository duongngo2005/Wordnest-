import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { imageSearchService } from "@/services/images";

vi.mock("@/services/images", () => ({
  imageSearchService: {
    searchCandidates: vi.fn(),
  },
}));

describe("GET /api/images/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty list if query parameter is empty", async () => {
    const request = new Request("http://localhost:3000/api/images/search?q=");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.images).toEqual([]);
    expect(imageSearchService.searchCandidates).not.toHaveBeenCalled();
  });

  it("calls imageSearchService.searchCandidates with query and limit", async () => {
    const mockImages = [
      {
        imageUrl: "https://example.com/cat.jpg",
        thumbnailUrl: "https://example.com/cat-thumb.jpg",
        title: "Cat illustration",
        source: "DuckDuckGo Web",
      },
    ];
    vi.mocked(imageSearchService.searchCandidates).mockResolvedValueOnce(mockImages);

    const request = new Request("http://localhost:3000/api/images/search?q=cat&limit=5");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.images).toEqual(mockImages);
    expect(imageSearchService.searchCandidates).toHaveBeenCalledWith("cat", 5);
  });
});
