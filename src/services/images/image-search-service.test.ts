import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CuratedImageProvider,
  DuckDuckGoImageProvider,
  OpenverseImageProvider,
  WikimediaImageProvider,
  MultiProviderImageSearchService,
  isJunkImage,
} from "./image-search-service";

describe("ImageSearchService and Providers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("CuratedImageProvider", () => {
    it("returns curated metadata for known terms like apple", async () => {
      const provider = new CuratedImageProvider();
      const result = await provider.search("apple");

      expect(result).not.toBeNull();
      expect(result?.imageUrl).toContain("unsplash.com");
      expect(result?.imageAuthor).toBe("Tom Hermans");
      expect(result?.imageLicense).toBe("Unsplash License");
      expect(result?.imagePageUrl).toBeTruthy();
    });

    it("returns null for non-curated terms", async () => {
      const provider = new CuratedImageProvider();
      const result = await provider.search("quantum mechanics noncurated");
      expect(result).toBeNull();
    });
  });

  describe("DuckDuckGoImageProvider", () => {
    it("fetches vqd and parses image results", async () => {
      const provider = new DuckDuckGoImageProvider();

      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("duckduckgo.com/?q=")) {
          return new Response('vqd="4-1234567890"', { status: 200 });
        }
        if (urlStr.includes("i.js")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  image: "https://example.com/cat.jpg",
                  thumbnail: "https://tse1.mm.bing.net/cat_thumb.jpg",
                  title: "Cat illustration",
                  url: "https://example.com/page",
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as unknown as typeof fetch;

      const candidates = await provider.searchMany("cat illustration", 5);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].imageUrl).toBe("https://example.com/cat.jpg");
      expect(candidates[0].thumbnailUrl).toBe("https://tse1.mm.bing.net/cat_thumb.jpg");
      expect(candidates[0].source).toBe("Web Search");

      const singleResult = await provider.search("cat illustration");
      expect(singleResult?.imageUrl).toBe("https://example.com/cat.jpg");
      expect(singleResult?.imageSource).toBe("Web Search");
    });
  });

  describe("OpenverseImageProvider", () => {
    it("parses openverse results", async () => {
      const provider = new OpenverseImageProvider();

      global.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            results: [
              {
                url: "https://example.com/tree.jpg",
                thumbnail: "https://example.com/tree_thumb.jpg",
                title: "Green Tree",
                source: "Flickr",
                creator: "John Doe",
                license: "cc-by",
              },
            ],
          }),
          { status: 200 }
        );
      }) as unknown as typeof fetch;

      const candidates = await provider.searchMany("tree", 5);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].imageUrl).toBe("https://example.com/tree.jpg");
      expect(candidates[0].source).toBe("Flickr");
      expect(candidates[0].author).toBe("John Doe");
    });
  });

  describe("WikimediaImageProvider", () => {
    it("parses wikipedia open api response and extracts metadata", async () => {
      const provider = new WikimediaImageProvider();

      global.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            query: {
              pages: {
                "12345": {
                  fullurl: "https://en.wikipedia.org/wiki/Guitar",
                  thumbnail: {
                    source: "https://upload.wikimedia.org/guitar.jpg",
                  },
                },
              },
            },
          }),
          { status: 200 }
        );
      }) as unknown as typeof fetch;

      const result = await provider.search("guitar music");
      expect(result).not.toBeNull();
      expect(result?.imageUrl).toBe("https://upload.wikimedia.org/guitar.jpg");
      expect(result?.imageSource).toBe("Wikimedia Commons");
      expect(result?.imageLicense).toContain("Public Domain");
      expect(result?.imagePageUrl).toBe("https://en.wikipedia.org/wiki/Guitar");
    });
  });

  describe("MultiProviderImageSearchService", () => {
    it("falls back through providers until match is found", async () => {
      const service = new MultiProviderImageSearchService();
      const appleResult = await service.searchImage("apple");
      expect(appleResult.imageUrl).toBeTruthy();
      expect(appleResult.imageAuthor).toBeTruthy();
    });

    it("returns safe nulls for empty queries", async () => {
      const service = new MultiProviderImageSearchService();
      const emptyResult = await service.searchImage("   ");
      expect(emptyResult.imageUrl).toBeNull();
    });

    it("searches candidates across providers and removes duplicates", async () => {
      const service = new MultiProviderImageSearchService();

      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("duckduckgo.com/?q=")) {
          return new Response('vqd="4-999"', { status: 200 });
        }
        if (urlStr.includes("i.js")) {
          return new Response(
            JSON.stringify({
              results: [
                { image: "https://example.com/img1.jpg", title: "Image 1" },
                { image: "https://example.com/img2.jpg", title: "Image 2" },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }) as unknown as typeof fetch;

      const candidates = await service.searchCandidates("test query", 5);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].imageUrl).toBe("https://example.com/img1.jpg");
    });

    it("optimizes search with searchImageForVocabulary", async () => {
      const service = new MultiProviderImageSearchService();
      const result = await service.searchImageForVocabulary("apple", "fresh red fruit");
      expect(result.imageUrl).toBeTruthy();
    });

    it("filters out junk images that match blacklist keywords like dictionary or worksheet", async () => {
      const service = new MultiProviderImageSearchService();

      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("duckduckgo.com/?q=")) {
          return new Response('vqd="4-999"', { status: 200 });
        }
        if (urlStr.includes("i.js")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  image: "https://example.com/submarine-dictionary.jpg",
                  title: "SUBMARINE English Dictionary and Vocabulary Worksheet",
                  url: "https://dictionary.example.com",
                },
                {
                  image: "https://example.com/real-submarine-underwater.jpg",
                  title: "Submarine diving in the deep ocean",
                  url: "https://ocean.example.com/sub",
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await service.searchImageForVocabulary("submarine", "submarine underwater navy");
      expect(result.imageUrl).toBe("https://example.com/real-submarine-underwater.jpg");
      expect(result.imageSource).toBe("Web Search");
    });

    it("deduplicates images using usedUrls and cleanly falls back to null if no non-duplicate exists", async () => {
      const service = new MultiProviderImageSearchService();

      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("duckduckgo.com/?q=")) {
          return new Response('vqd="4-999"', { status: 200 });
        }
        if (urlStr.includes("i.js")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  image: "https://example.com/already-used.jpg",
                  title: "A valid picture that was already used",
                  url: "https://example.com/photo",
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }) as unknown as typeof fetch;

      const usedUrls = new Set<string>(["https://example.com/already-used.jpg"]);
      const result = await service.searchImageForVocabulary("testword", "test query", { usedUrls });

      // No alternative candidate => clean null fallback without error
      expect(result.imageUrl).toBeNull();
      expect(result.imageSource).toBeNull();
    });
  });

  describe("isJunkImage blacklist detector", () => {
    it("identifies junk terms in title or url", () => {
      expect(isJunkImage({ title: "English Vocabulary Worksheet Quiz" })).toBe(true);
      expect(isJunkImage({ title: "Dictionary definition of banana" })).toBe(true);
      expect(isJunkImage({ imageUrl: "https://example.com/infographic_chart.png" })).toBe(true);
      expect(isJunkImage({ pageUrl: "https://grammar-quiz.com/card" })).toBe(true);
      expect(isJunkImage({ title: "Yellow banana on wooden table" })).toBe(false);
    });
  });
});
