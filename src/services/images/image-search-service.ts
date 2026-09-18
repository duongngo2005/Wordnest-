export interface ImageSearchResult {
  imageUrl: string | null;
  imageSource: string | null;
  imageSearchQuery: string | null;
}

export interface ImageSearchService {
  searchImage(query: string): Promise<ImageSearchResult>;
}

// Fallback high-quality curated images for common vocabulary items
const CURATED_IMAGES: Record<string, string> = {
  apple: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80",
  resilient: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=600&q=80",
  banana: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=600&q=80",
  "cloud computing": "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=600&q=80",
};

export class UnsplashAndWikipediaImageSearchService implements ImageSearchService {
  private unsplashAccessKey: string;

  constructor(unsplashAccessKey?: string) {
    this.unsplashAccessKey = unsplashAccessKey || process.env.UNSPLASH_ACCESS_KEY || "";
  }

  async searchImage(query: string): Promise<ImageSearchResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { imageUrl: null, imageSource: null, imageSearchQuery: null };
    }

    // 1. Check curated image registry
    const lower = trimmed.toLowerCase();
    for (const [key, url] of Object.entries(CURATED_IMAGES)) {
      if (lower.includes(key)) {
        return {
          imageUrl: url,
          imageSource: "Curated Unsplash",
          imageSearchQuery: trimmed,
        };
      }
    }

    // 2. Try Unsplash API if access key is available
    if (this.unsplashAccessKey) {
      try {
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(trimmed)}&per_page=1&orientation=landscape`,
          {
            headers: {
              Authorization: `Client-ID ${this.unsplashAccessKey}`,
            },
            signal: AbortSignal.timeout(4000),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const first = data?.results?.[0];
          if (first?.urls?.regular) {
            return {
              imageUrl: first.urls.regular,
              imageSource: `Unsplash (@${first.user?.username || "creator"})`,
              imageSearchQuery: trimmed,
            };
          }
        }
      } catch (err) {
        console.warn(`Unsplash image search failed for "${trimmed}":`, err);
      }
    }

    // 3. Try Wikipedia Open API (free, reliable, requires no authentication)
    try {
      // Use the first word or main noun for Wikipedia article title lookup
      const mainSubject = trimmed.split(" ")[0];
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=600&titles=${encodeURIComponent(mainSubject)}&origin=*`;
      const wikiRes = await fetch(wikiUrl, {
        signal: AbortSignal.timeout(3000),
      });

      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const pages = wikiData?.query?.pages;
        if (pages) {
          const firstPageId = Object.keys(pages)[0];
          const page = pages[firstPageId];
          if (page?.thumbnail?.source) {
            return {
              imageUrl: page.thumbnail.source,
              imageSource: "Wikimedia Commons",
              imageSearchQuery: trimmed,
            };
          }
        }
      }
    } catch (err) {
      console.warn(`Wikipedia image search failed for "${trimmed}":`, err);
    }

    // Safe fallback: images are non-blocking
    return {
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: trimmed,
    };
  }
}

export const imageSearchService = new UnsplashAndWikipediaImageSearchService();
