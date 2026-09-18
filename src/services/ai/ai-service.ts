import {
  aiBatchFlashcardResponseSchema,
  GeneratedFlashcardItem,
} from "@/lib/validation/flashcard";
import { normalizeTerm } from "@/services/vocabulary/parser";

export interface AIService {
  generateFlashcards(terms: string[]): Promise<GeneratedFlashcardItem[]>;
}

// Built-in educational dictionary for core terms and offline fallback
const CURATED_DICTIONARY: Record<string, Omit<GeneratedFlashcardItem, "term">> = {
  apple: {
    meaningVi: "quả táo",
    definitionEn: "a round fruit with red, yellow, or green skin and firm white flesh",
    ipa: "/ˈæp.əl/",
    partOfSpeech: "noun",
    cefr: "A1",
    exampleEn: "She sliced a fresh red apple for breakfast.",
    exampleVi: "Cô ấy cắt một quả táo đỏ tươi cho bữa sáng.",
    imageUseful: true,
    imageSearchQuery: "fresh red apple fruit",
  },
  resilient: {
    meaningVi: "kiên cường, có khả năng phục hồi nhanh",
    definitionEn: "able to quickly recover from difficulties or withstand shock",
    ipa: "/rɪˈzɪl.jənt/",
    partOfSpeech: "adjective",
    cefr: "B2",
    exampleEn: "The community remained resilient and rebuilt the town after the storm.",
    exampleVi: "Cộng đồng vẫn kiên cường và xây dựng lại thị trấn sau cơn bão.",
    imageUseful: true,
    imageSearchQuery: "plant sprouting from rock resilience",
  },
  "take responsibility": {
    meaningVi: "nhận trách nhiệm, chịu trách nhiệm",
    definitionEn: "to accept duty or blame for an action or situation",
    ipa: "/teɪk rɪˌspɒn.sɪˈbɪl.ə.ti/",
    partOfSpeech: "phrase",
    cefr: "B1",
    exampleEn: "A mature leader knows how to take responsibility when mistakes happen.",
    exampleVi: "Một người lãnh đạo trưởng thành biết cách nhận trách nhiệm khi xảy ra sai lầm.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  reluctant: {
    meaningVi: "lưỡng lự, miễn cưỡng",
    definitionEn: "unwilling and hesitant to do something",
    ipa: "/rɪˈlʌk.tənt/",
    partOfSpeech: "adjective",
    cefr: "B2",
    exampleEn: "He was reluctant to admit that he needed help.",
    exampleVi: "Anh ấy miễn cưỡng thừa nhận rằng mình cần sự giúp đỡ.",
    imageUseful: false,
    imageSearchQuery: null,
  },
  "cloud computing": {
    meaningVi: "điện toán đám mây",
    definitionEn: "the practice of using a network of remote servers hosted on the internet to store and manage data",
    ipa: "/ˌklaʊd kəmˈpjuː.tɪŋ/",
    partOfSpeech: "noun phrase",
    cefr: "B2",
    exampleEn: "Cloud computing allows companies to scale resources on demand.",
    exampleVi: "Điện toán đám mây cho phép các công ty mở rộng tài nguyên theo nhu cầu.",
    imageUseful: true,
    imageSearchQuery: "cloud computing server network datacenter",
  },
  banana: {
    meaningVi: "quả chuối",
    definitionEn: "a long curved fruit with a yellow skin and soft sweet flesh",
    ipa: "/bəˈnɑː.nə/",
    partOfSpeech: "noun",
    cefr: "A1",
    exampleEn: "Monkeys love eating ripe bananas.",
    exampleVi: "Khỉ rất thích ăn những quả chuối chín.",
    imageUseful: true,
    imageSearchQuery: "yellow ripe banana bunch",
  },
};

export class GeminiAIService implements AIService {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model = "gemini-2.5-flash") {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    this.model = model;
  }

  async generateFlashcards(terms: string[]): Promise<GeneratedFlashcardItem[]> {
    if (!terms || terms.length === 0) {
      return [];
    }

    // If no API key is configured, utilize curated and intelligent fallback
    if (!this.apiKey) {
      return this.generateFallbackFlashcards(terms);
    }

    // Call Gemini with retry
    try {
      return await this.callGeminiWithRetry(terms, 2);
    } catch (error) {
      console.warn("Gemini API call failed, falling back to offline dictionary:", error);
      return this.generateFallbackFlashcards(terms);
    }
  }

  private async callGeminiWithRetry(terms: string[], retriesLeft: number): Promise<GeneratedFlashcardItem[]> {
    try {
      const prompt = `You are an expert English vocabulary teacher for Vietnamese learners.
Generate comprehensive flashcard data for the following English vocabulary terms or phrases:
${JSON.stringify(terms)}

For each term:
1. Identify the most common, useful meaning for learners.
2. If it is a phrase or idiom, keep the entire phrase intact.
3. Write a concise, natural Vietnamese meaning in 'meaningVi'.
4. Provide a clear, easy-to-understand English definition in 'definitionEn'.
5. Include accurate IPA phonetics in 'ipa'.
6. State the part of speech (noun, verb, adjective, phrase, phrasal verb, etc.) in 'partOfSpeech'.
7. Assign the CEFR level strictly as one of: "A1", "A2", "B1", "B2", "C1", "C2" (or null if unclassifiable).
8. Write a natural example sentence in 'exampleEn'.
9. Translate that example sentence into natural Vietnamese in 'exampleVi'.
10. Set 'imageUseful' to true if a picture would aid visual memorization (e.g. concrete nouns, physical actions, visual concepts), otherwise false.
11. If 'imageUseful' is true, provide a clear, unambiguous photo search query in 'imageSearchQuery' (e.g. "red apple fruit"); otherwise set to null.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "flashcards": [
    {
      "term": "string",
      "meaningVi": "string",
      "definitionEn": "string",
      "ipa": "string or null",
      "partOfSpeech": "string or null",
      "cefr": "A1 | A2 | B1 | B2 | C1 | C2 | null",
      "exampleEn": "string",
      "exampleVi": "string",
      "imageUseful": boolean,
      "imageSearchQuery": "string or null"
    }
  ]
}`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error("No content generated by Gemini API");
      }

      const parsedJson = JSON.parse(rawText);
      const validated = aiBatchFlashcardResponseSchema.safeParse(parsedJson);

      if (!validated.success) {
        throw new Error(`Invalid schema from AI: ${JSON.stringify(validated.error.format())}`);
      }

      // Ensure every requested term has an entry
      const termMap = new Map<string, GeneratedFlashcardItem>();
      for (const item of validated.data.flashcards) {
        termMap.set(normalizeTerm(item.term), item);
      }

      return terms.map((term) => {
        const normalized = normalizeTerm(term);
        const match = termMap.get(normalized);
        if (match) {
          return { ...match, term }; // retain user's casing
        }
        return this.generateSingleFallback(term);
      });
    } catch (err) {
      if (retriesLeft > 0) {
        console.warn(`Retrying Gemini request... (${retriesLeft} retries remaining)`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.callGeminiWithRetry(terms, retriesLeft - 1);
      }
      throw err;
    }
  }

  private generateSingleFallback(term: string): GeneratedFlashcardItem {
    const normalized = normalizeTerm(term);
    const curated = CURATED_DICTIONARY[normalized];
    if (curated) {
      return {
        term,
        ...curated,
      };
    }

    // Clean fallback for arbitrary English terms
    const isPhrase = term.includes(" ");
    return {
      term,
      meaningVi: `Ý nghĩa của "${term}"`,
      definitionEn: `The word or phrase "${term}" in English context.`,
      ipa: null,
      partOfSpeech: isPhrase ? "phrase" : "noun",
      cefr: "B1",
      exampleEn: `We can use "${term}" in a sentence to express ideas clearly.`,
      exampleVi: `Chúng ta có thể dùng "${term}" trong câu để diễn đạt ý kiến một cách rõ ràng.`,
      imageUseful: !isPhrase,
      imageSearchQuery: isPhrase ? null : `${term} photo`,
    };
  }

  private generateFallbackFlashcards(terms: string[]): GeneratedFlashcardItem[] {
    return terms.map((term) => this.generateSingleFallback(term));
  }
}

export const aiService = new GeminiAIService();
