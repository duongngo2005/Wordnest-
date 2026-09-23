export interface ImageSearchResult {
  imageUrl: string | null;
  thumbnailUrl?: string | null;
  imageSource: string | null;
  imageSearchQuery: string | null;
  imagePageUrl?: string | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
}

export interface ImageCandidate {
  imageUrl: string;
  thumbnailUrl?: string;
  title: string;
  source: string;
  pageUrl?: string;
  author?: string;
  license?: string;
}

export interface ImageProvider {
  name: string;
  search(query: string): Promise<ImageSearchResult | null>;
  searchMany?(query: string, limit: number): Promise<ImageCandidate[]>;
}

interface CuratedItem {
  url: string;
  author: string;
  sourcePageUrl: string;
  license: string;
}

const CURATED_IMAGES: Record<string, CuratedItem> = {
  apple: {
    url: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80",
    author: "Tom Hermans",
    sourcePageUrl: "https://unsplash.com/photos/red-apple-fruit",
    license: "Unsplash License",
  },
  resilient: {
    url: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=600&q=80",
    author: "Luca Zanon",
    sourcePageUrl: "https://unsplash.com/photos/green-plant-sprouting",
    license: "Unsplash License",
  },
  banana: {
    url: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=600&q=80",
    author: "Eiliv Aceron",
    sourcePageUrl: "https://unsplash.com/photos/yellow-banana-bunch",
    license: "Unsplash License",
  },
  "cloud computing": {
    url: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=600&q=80",
    author: "Taylor Vick",
    sourcePageUrl: "https://unsplash.com/photos/server-rack-datacenter",
    license: "Unsplash License",
  },
};

export class CuratedImageProvider implements ImageProvider {
  name = "Curated";

  async search(query: string): Promise<ImageSearchResult | null> {
    const lower = query.toLowerCase().trim();
    for (const [key, item] of Object.entries(CURATED_IMAGES)) {
      if (lower.includes(key)) {
        return {
          imageUrl: item.url,
          imageSource: "Curated Unsplash",
          imageSearchQuery: query,
          imageAuthor: item.author,
          imagePageUrl: item.sourcePageUrl,
          imageLicense: item.license,
        };
      }
    }
    return null;
  }
}

export class DuckDuckGoImageProvider implements ImageProvider {
  name = "DuckDuckGo Web";

  private async fetchVqd(query: string): Promise<string | null> {
    try {
      const res = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const match = html.match(/vqd=([0-9-_]+)/) || html.match(/vqd=["']([0-9-_]+)["']/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async search(query: string): Promise<ImageSearchResult | null> {
    const candidates = await this.searchMany(query, 1);
    if (candidates.length > 0) {
      const first = candidates[0];
      return {
        imageUrl: first.imageUrl,
        imageSource: "Web Search",
        imageSearchQuery: query,
        imagePageUrl: first.pageUrl || null,
        imageAuthor: first.author || null,
        imageLicense: null,
      };
    }
    return null;
  }

  async searchMany(query: string, limit: number = 12): Promise<ImageCandidate[]> {
    try {
      const vqd = await this.fetchVqd(query);
      if (!vqd) return [];

      const endpoint = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
        query
      )}&vqd=${vqd}&p=1`;

      const res = await fetch(endpoint, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://duckduckgo.com/",
        },
        signal: AbortSignal.timeout(4500),
      });

      if (!res.ok) return [];
      const data = await res.json();
      const results = Array.isArray(data?.results) ? data.results : [];

      const candidates: ImageCandidate[] = [];
      for (const item of results) {
        if (!item?.image) continue;
        candidates.push({
          imageUrl: item.image,
          thumbnailUrl: item.thumbnail || item.image,
          title: item.title || query,
          source: "Web Search",
          pageUrl: item.url || undefined,
        });
        if (candidates.length >= limit) break;
      }
      return candidates;
    } catch (err) {
      console.warn(`[DuckDuckGoProvider] Search failed for "${query}":`, err);
      return [];
    }
  }
}

export class OpenverseImageProvider implements ImageProvider {
  name = "Openverse";

  async search(query: string): Promise<ImageSearchResult | null> {
    const candidates = await this.searchMany(query, 1);
    if (candidates.length > 0) {
      const first = candidates[0];
      return {
        imageUrl: first.imageUrl,
        imageSource: "Openverse",
        imageSearchQuery: query,
        imagePageUrl: first.pageUrl || null,
        imageAuthor: first.author || null,
        imageLicense: first.license || null,
      };
    }
    return null;
  }

  async searchMany(query: string, limit: number = 12): Promise<ImageCandidate[]> {
    try {
      const endpoint = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
        query
      )}&page_size=${Math.min(limit, 20)}`;

      const res = await fetch(endpoint, {
        headers: {
          "User-Agent": "WordNestApp/1.0",
        },
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) return [];
      const data = await res.json();
      const results = Array.isArray(data?.results) ? data.results : [];

      const candidates: ImageCandidate[] = [];
      for (const item of results) {
        if (!item?.url) continue;
        candidates.push({
          imageUrl: item.url,
          thumbnailUrl: item.thumbnail || item.url,
          title: item.title || query,
          source: item.source || "Openverse",
          pageUrl: item.foreign_landing_url || undefined,
          author: item.creator || undefined,
          license: item.license || undefined,
        });
        if (candidates.length >= limit) break;
      }
      return candidates;
    } catch (err) {
      console.warn(`[OpenverseProvider] Search failed for "${query}":`, err);
      return [];
    }
  }
}

export class UnsplashImageProvider implements ImageProvider {
  name = "Unsplash";
  private accessKey: string;

  constructor(accessKey?: string) {
    this.accessKey = accessKey || process.env.UNSPLASH_ACCESS_KEY || "";
  }

  async search(query: string): Promise<ImageSearchResult | null> {
    if (!this.accessKey) return null;

    try {
      const endpoint = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        query
      )}&per_page=1&orientation=landscape`;

      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Client-ID ${this.accessKey}`,
        },
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const first = data?.results?.[0];
      if (first?.urls?.regular) {
        return {
          imageUrl: first.urls.regular,
          imageSource: "Unsplash",
          imageSearchQuery: query,
          imageAuthor: first.user?.name || `@${first.user?.username || "creator"}`,
          imagePageUrl: first.links?.html || `https://unsplash.com/@${first.user?.username}`,
          imageLicense: "Unsplash License",
        };
      }
    } catch (err) {
      console.warn(`[UnsplashProvider] Search failed for "${query}":`, err);
    }
    return null;
  }
}

export class WikimediaImageProvider implements ImageProvider {
  name = "Wikimedia Commons";

  async search(query: string): Promise<ImageSearchResult | null> {
    try {
      const mainSubject = query.split(" ")[0];
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages|info&inprop=url&format=json&pithumbsize=600&titles=${encodeURIComponent(
        mainSubject
      )}&origin=*`;

      const res = await fetch(wikiUrl, {
        signal: AbortSignal.timeout(3500),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const pages = data?.query?.pages;
      if (pages) {
        const firstPageId = Object.keys(pages)[0];
        if (firstPageId && firstPageId !== "-1") {
          const page = pages[firstPageId];
          if (page?.thumbnail?.source) {
            return {
              imageUrl: page.thumbnail.source,
              imageSource: "Wikimedia Commons",
              imageSearchQuery: query,
              imageAuthor: "Wikimedia Contributor",
              imagePageUrl: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(mainSubject)}`,
              imageLicense: "CC BY-SA / Public Domain",
            };
          }
        }
      }
    } catch (err) {
      console.warn(`[WikimediaProvider] Search failed for "${query}":`, err);
    }
    return null;
  }
}

export const JUNK_IMAGE_KEYWORDS = [
  "dictionary",
  "definition",
  "vocabulary",
  "worksheet",
  "grammar",
  "quiz",
  "logo",
  "infographic",
  "banner",
  "clipart",
  "word meaning",
  "flashcard template",
  "learn english",
  "vector",
  "watermark",
  "shutterstock",
  "stock photo",
  "diagram",
  "textbook",
  "silhouette",
  "svgsilh",
  "coloring page",
  "sign symbol icon",
];

export function isJunkImage(cand: { title?: string; imageUrl?: string; pageUrl?: string }): boolean {
  const text = `${cand.title || ""} ${cand.imageUrl || ""} ${cand.pageUrl || ""}`.toLowerCase();
  return JUNK_IMAGE_KEYWORDS.some((kw) => text.includes(kw));
}

export class MultiProviderImageSearchService {
  private providers: ImageProvider[];

  constructor(providers?: ImageProvider[]) {
    this.providers = providers || [
      new CuratedImageProvider(),
      new DuckDuckGoImageProvider(),
      new OpenverseImageProvider(),
      new UnsplashImageProvider(),
      new WikimediaImageProvider(),
    ];
  }

  async searchImage(query: string): Promise<ImageSearchResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { imageUrl: null, imageSource: null, imageSearchQuery: null };
    }

    for (const provider of this.providers) {
      try {
        const result = await provider.search(trimmed);
        if (result && result.imageUrl) {
          return result;
        }
      } catch (err) {
        console.warn(`[ImageSearchService] Provider ${provider.name} failed:`, err);
      }
    }

    return {
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: trimmed,
    };
  }

  /**
   * Search contextual image for flashcard:
   * 1. Uses contextual imageQuery from AI (never single raw word or "vocabulary" junk)
   * 2. Checks top 3-5 candidates
   * 3. Filters out blacklist/junk (dictionary, text, worksheet, infographic, logo)
   * 4. Deduplicates against usedUrls in current batch
   * 5. Cleanly returns null if no high-quality match is found (no image is a valid result)
   */
  async searchImageForVocabulary(
    term: string,
    contextQuery?: string | null,
    options?: { usedUrls?: Set<string> }
  ): Promise<ImageSearchResult> {
    const cleanTerm = term.trim();
    const cleanContext = (contextQuery || "").trim();
    const usedUrls = options?.usedUrls;

    // Prioritize contextual query
    const query = cleanContext || cleanTerm;
    if (!query) {
      return { imageUrl: null, imageSource: null, imageSearchQuery: null };
    }

    // Check Curated provider first for known sample terms
    for (const provider of this.providers) {
      if (provider instanceof CuratedImageProvider) {
        const curResult = await provider.search(cleanTerm);
        if (curResult?.imageUrl && (!usedUrls || !usedUrls.has(curResult.imageUrl))) {
          return { ...curResult, imageSearchQuery: query };
        }
      }
    }

    // Search top 5 candidates across providers (strictly inspect at most top 5 candidates)
    const candidates = await this.searchCandidates(query, 5, { filterJunk: true, maxInspect: 5 });

    for (const cand of candidates) {
      if (!cand.imageUrl) continue;
      // Skip if in usedUrls
      if (usedUrls && usedUrls.has(cand.imageUrl)) continue;
      // Skip if junk
      if (isJunkImage(cand)) continue;

      return {
        imageUrl: cand.imageUrl,
        thumbnailUrl: cand.thumbnailUrl,
        imageSource: cand.source,
        imageSearchQuery: query,
        imagePageUrl: cand.pageUrl || null,
        imageAuthor: cand.author || null,
        imageLicense: cand.license || null,
      };
    }

    // Clean no image result (valid state, not a failure)
    return {
      imageUrl: null,
      imageSource: null,
      imageSearchQuery: query,
    };
  }

  /**
   * Search multiple candidate images across web providers
   * for the interactive Image Picker modal.
   */
  async searchCandidates(
    query: string,
    limit: number = 12,
    options?: { filterJunk?: boolean; maxInspect?: number }
  ): Promise<ImageCandidate[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const shouldFilterJunk = options?.filterJunk ?? true;
    const maxInspect = options?.maxInspect;
    const results: ImageCandidate[] = [];
    const seenUrls = new Set<string>();

    for (const provider of this.providers) {
      if (typeof provider.searchMany === "function") {
        try {
          const fetchCount = maxInspect ?? limit * 2;
          const candidates = await provider.searchMany(trimmed, fetchCount);
          let inspected = 0;
          for (const cand of candidates) {
            if (!cand?.imageUrl) continue;
            if (seenUrls.has(cand.imageUrl)) continue;
            inspected++;
            if (maxInspect && inspected > maxInspect) break;

            if (shouldFilterJunk && isJunkImage(cand)) continue;

            seenUrls.add(cand.imageUrl);
            results.push(cand);
            if (results.length >= limit) break;
          }
        } catch (err) {
          console.warn(`[ImageSearchService] searchMany failed for ${provider.name}:`, err);
        }
      }
      if (results.length >= limit) break;
    }

    return results;
  }
}

export const imageSearchService = new MultiProviderImageSearchService();
