import {
  aiBatchFlashcardResponseSchema,
  GeneratedFlashcardItem,
} from "@/lib/validation/flashcard";
import {
  aiStoryResponseSchema,
  AIStoryResponse,
  contextualTranslationResponseSchema,
  ContextualTranslationResponse,
  StoryCefr,
  StoryLength,
  StoryTopic,
} from "@/lib/validation/story";
import { normalizeTerm } from "@/services/vocabulary/parser";

export interface AIService {
  generateFlashcards(terms: string[]): Promise<GeneratedFlashcardItem[]>;
  generateStory(params: {
    targetWords: string[];
    cefr?: StoryCefr;
    length?: StoryLength;
    topic?: StoryTopic;
  }): Promise<AIStoryResponse>;
  translateInContext(params: {
    selectedText: string;
    surroundingSentence: string;
    context?: string;
  }): Promise<ContextualTranslationResponse>;
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

    if (!this.apiKey) {
      return this.generateFallbackFlashcards(terms);
    }

    try {
      return await this.callGeminiFlashcardsWithRetry(terms, 2);
    } catch (error) {
      console.warn("Gemini API call failed, falling back to offline dictionary:", error);
      return this.generateFallbackFlashcards(terms);
    }
  }

  private async callGeminiFlashcardsWithRetry(
    terms: string[],
    retriesLeft: number
  ): Promise<GeneratedFlashcardItem[]> {
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
10. Set 'imageUseful' to true if a picture would aid visual memorization, otherwise false.
11. If 'imageUseful' is true, provide a clear photo search query in 'imageSearchQuery'; otherwise set to null.

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
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

      const termMap = new Map<string, GeneratedFlashcardItem>();
      for (const item of validated.data.flashcards) {
        termMap.set(normalizeTerm(item.term), item);
      }

      return terms.map((term) => {
        const normalized = normalizeTerm(term);
        const match = termMap.get(normalized);
        if (match) {
          return { ...match, term };
        }
        return this.generateSingleFallback(term);
      });
    } catch (err) {
      if (retriesLeft > 0) {
        console.warn(`Retrying Gemini request... (${retriesLeft} retries remaining)`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.callGeminiFlashcardsWithRetry(terms, retriesLeft - 1);
      }
      throw err;
    }
  }

  /**
   * Generates a coherent, engaging short story incorporating selected target vocabulary.
   */
  async generateStory({
    targetWords,
    cefr = "B1",
    length = "medium",
    topic = "Daily Life",
  }: {
    targetWords: string[];
    cefr?: StoryCefr;
    length?: StoryLength;
    topic?: StoryTopic;
  }): Promise<AIStoryResponse> {
    if (!targetWords || targetWords.length === 0) {
      throw new Error("At least one target word is required to generate a story.");
    }

    if (!this.apiKey) {
      return this.generateFallbackStory(targetWords, cefr, length, topic);
    }

    const wordCountGuide =
      length === "short"
        ? "around 100 to 150 words (2-3 concise paragraphs)"
        : length === "long"
        ? "around 350 to 500 words (4-6 detailed paragraphs)"
        : "around 200 to 280 words (3-4 paragraphs)";

    const prompt = `You are a talented author and English language teacher writing an engaging, memorable story for English learners.

Target Vocabulary to include naturally in the story:
${JSON.stringify(targetWords)}

Requirements:
1. Topic: ${topic}
2. Language level: CEFR ${cefr}. The sentence structure, vocabulary, and grammar should naturally align with ${cefr}.
3. Length: ${wordCountGuide}.
4. Naturally weave all or as many target words as possible into the narrative context. Do NOT force them in an awkward list.
5. Provide a catchy, appealing title for the story.
6. List all target words successfully used in the 'wordsUsed' array.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "title": "Story Title Here",
  "content": "Paragraph 1\\n\\nParagraph 2\\n\\nParagraph 3",
  "wordsUsed": ["word1", "word2"]
}`;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("No story content returned by AI");

      const parsed = JSON.parse(rawText);
      const validated = aiStoryResponseSchema.safeParse(parsed);

      if (!validated.success) {
        throw new Error("Invalid story schema returned by AI");
      }

      return validated.data;
    } catch (err) {
      console.warn("Gemini story generation failed, falling back to local story generator:", err);
      return this.generateFallbackStory(targetWords, cefr, length, topic);
    }
  }

  /**
   * Translates a selected word or phrase in its exact context inside the story.
   */
  async translateInContext({
    selectedText,
    surroundingSentence,
    context = "",
  }: {
    selectedText: string;
    surroundingSentence: string;
    context?: string;
  }): Promise<ContextualTranslationResponse> {
    const trimmedWord = selectedText.trim();
    if (!trimmedWord) {
      throw new Error("Selected word is empty.");
    }

    if (!this.apiKey) {
      return this.generateFallbackContextualTranslation(
        trimmedWord,
        surroundingSentence
      );
    }

    const prompt = `You are an expert bilingual English-Vietnamese translator and vocabulary instructor.
Translate and explain the selected word or phrase within the exact context of the provided sentence.

Selected Word/Phrase: "${trimmedWord}"
Surrounding Sentence: "${surroundingSentence}"
Context Paragraph: "${context}"

Instructions:
1. Provide 'meaningVi': General primary Vietnamese meaning.
2. Provide 'contextualMeaningVi': Specific nuance or meaning of this term within this exact sentence context.
3. Provide 'ipa': Phonetic pronunciation (IPA).
4. Provide 'partOfSpeech': Part of speech in this sentence (noun, verb, adjective, etc.).
5. Provide 'definitionEn': Concise English definition matching the context.
6. Set 'exampleEn': The surrounding sentence itself.
7. Provide 'exampleVi': Accurate, natural Vietnamese translation of the entire surrounding sentence.
8. Set 'cefr': Estimated CEFR level (A1, A2, B1, B2, C1, C2).

You MUST respond strictly with a valid JSON object matching this schema:
{
  "selectedText": "${trimmedWord}",
  "meaningVi": "string",
  "contextualMeaningVi": "string",
  "ipa": "string or null",
  "partOfSpeech": "string or null",
  "definitionEn": "string",
  "exampleEn": "string",
  "exampleVi": "string",
  "cefr": "string or null"
}`;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini translation HTTP ${response.status}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("No translation returned by AI");

      const parsed = JSON.parse(rawText);
      const validated = contextualTranslationResponseSchema.safeParse(parsed);

      if (!validated.success) {
        throw new Error("Invalid translation schema from AI");
      }

      return validated.data;
    } catch (err) {
      console.warn("Contextual translation AI failed, using fallback:", err);
      return this.generateFallbackContextualTranslation(
        trimmedWord,
        surroundingSentence
      );
    }
  }

  private generateSingleFallback(term: string): GeneratedFlashcardItem {
    const normalized = normalizeTerm(term);
    const curated = CURATED_DICTIONARY[normalized];
    if (curated) {
      return { term, ...curated };
    }

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

  private generateFallbackStory(
    targetWords: string[],
    cefr: StoryCefr,
    length: StoryLength,
    topic: StoryTopic
  ): AIStoryResponse {
    const title =
      topic === "IT"
        ? "The Midnight Code Release"
        : topic === "Travel"
        ? "A Journey Across the Mountains"
        : topic === "Mystery"
        ? "The Clue in the Old Library"
        : topic === "Fantasy"
        ? "The Whispering Forest"
        : "A Day of New Discoveries";

    const sentences = [
      `It was an ordinary morning when Maya started her daily routine, thinking about how to ${targetWords[0] || "improve"}.`,
      targetWords.length > 1
        ? `She knew she had to be ${targetWords[1]} in the face of sudden difficulties, rather than avoiding what lay ahead.`
        : "She prepared herself to stay calm and focus on the task ahead.",
      targetWords.length > 2
        ? `Her team reminded her to ${targetWords[2]} and lead by example.`
        : "Every small step counted toward reaching the final milestone.",
      targetWords.length > 3
        ? `Even though she was initially ${targetWords[3]} to make a major change, the advice proved invaluable.`
        : "With renewed determination, she stepped forward with full confidence.",
      `By the evening, Maya looked back at what had unfolded with deep satisfaction. Turning challenges into stories had always been her greatest strength.`,
    ];

    if (length === "long") {
      sentences.push(
        "Later that night, as the stars illuminated the quiet horizon, she reflected on every conversation. Knowledge gained through real experience remains etched in the mind forever."
      );
    }

    const content = sentences.join("\n\n");
    return {
      title,
      content,
      wordsUsed: targetWords,
    };
  }

  private generateFallbackContextualTranslation(
    word: string,
    sentence: string
  ): ContextualTranslationResponse {
    const normalized = normalizeTerm(word);
    const curated = CURATED_DICTIONARY[normalized];

    const meaningVi = curated ? curated.meaningVi : `Ý nghĩa của "${word}"`;
    const contextualMeaningVi = curated
      ? `Trong ngữ cảnh này: ${curated.meaningVi}`
      : `Ý nghĩa trong câu: "${word}"`;

    return {
      selectedText: word,
      meaningVi,
      contextualMeaningVi,
      ipa: curated?.ipa || null,
      partOfSpeech: curated?.partOfSpeech || (word.includes(" ") ? "phrase" : "noun"),
      definitionEn: curated?.definitionEn || `The meaning of "${word}" in this sentence.`,
      exampleEn: sentence,
      exampleVi: `Dịch câu: ${sentence}`,
      cefr: curated?.cefr || "B1",
    };
  }
}

export const aiService = new GeminiAIService();
