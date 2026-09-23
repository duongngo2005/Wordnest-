import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { aiService } from "../src/services/ai/ai-service";
import { imageSearchService, isJunkImage } from "../src/services/images/image-search-service";
import { AUTO_IMAGE_MIN_SCORE, GeneratedFlashcardItem } from "../src/lib/validation/flashcard";
import { POST as uploadPost, DELETE as uploadDelete } from "../src/app/api/upload/image/route";
import { deckService } from "../src/services/vocabulary/deck-service";
import { db } from "../src/lib/db";

interface CardUATResult {
  deck: string;
  term: string;
  meaningVi: string;
  definitionEn: string;
  exampleEn: string;
  visualScore: number;
  imageSearchQuery: string | null;
  searchTriggered: boolean;
  imageUrl: string | null;
  imageSource: string | null;
  discardReason?: string;
  isJunk: boolean;
  isDuplicate: boolean;
}

const DECK_A_TERMS = [
  "apple", "microscope", "giraffe", "parachute", "submarine",
  "hammer", "cactus", "helmet", "ladder", "squirrel",
  "yawn", "shiver", "stumble", "whisper", "crawl",
  "exhausted", "crowded", "slippery", "cluttered", "soaked"
];

const DECK_B_TERMS = [
  "perspective", "comprehensive", "significantly", "nevertheless", "leverage",
  "assumption", "consequence", "strategy", "responsibility", "opportunity",
  "discussion", "meeting", "office", "employee", "customer",
  "process", "benefit", "requirement", "efficient", "relevant"
];

const DECK_C_ITEMS = [
  { term: "bank", meaningVi: "bờ sông", exampleEn: "We sat on the grassy bank beside the river." },
  { term: "bank", meaningVi: "ngân hàng", exampleEn: "She went to the bank to withdraw some money." },
  { term: "plant", meaningVi: "cây cối", exampleEn: "This tropical plant needs plenty of sunlight." },
  { term: "plant", meaningVi: "nhà máy", exampleEn: "He works at a large automobile manufacturing plant." },
  { term: "bat", meaningVi: "con dơi", exampleEn: "A bat flew out of the cave at night." },
  { term: "bat", meaningVi: "gậy đánh bóng", exampleEn: "He swung the baseball bat." },
  { term: "crane", meaningVi: "chim sếu", exampleEn: "A tall white crane stood gracefully in the shallow water." },
  { term: "crane", meaningVi: "cần cẩu", exampleEn: "The giant construction crane lifted heavy steel girders." },
  { term: "pitch", meaningVi: "sân bóng đá", exampleEn: "The players walked onto the wet grass pitch." },
  { term: "pitch", meaningVi: "bài thuyết trình bán hàng", exampleEn: "The founder delivered a convincing sales pitch to investors." },
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processBatch(
  deckName: string,
  items: (string | { term: string; meaningVi?: string; exampleEn?: string })[],
  usedGlobalUrls: Set<string>
): Promise<CardUATResult[]> {
  console.log(`\n======================================================`);
  console.log(`[UAT] Generating AI Flashcards for ${deckName} (${items.length} items)...`);
  console.log(`======================================================`);

  const results: CardUATResult[] = [];
  const batchSize = 2;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    console.log(`[UAT] Processing sub-batch ${i + 1} to ${Math.min(i + batchSize, items.length)} of ${deckName}...`);
    
    let generatedCards: GeneratedFlashcardItem[] = [];
    let attempts = 0;
    while (attempts < 4) {
      try {
        attempts++;
        generatedCards = await aiService.generateFlashcards(chunk);
        break;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[UAT] Attempt ${attempts} error for sub-batch: ${errorMsg}`);
        if (attempts >= 4) throw err;
        await sleep(2500 * attempts);
      }
    }

    // Now process image search for each card
    for (const card of generatedCards) {
      const isVisual =
        card.visualScore !== undefined
          ? card.visualScore >= AUTO_IMAGE_MIN_SCORE
          : Boolean(card.imageUseful);
      const shouldSearch = isVisual && Boolean(card.imageSearchQuery);

      let imageUrl: string | null = null;
      let imageSource: string | null = null;
      let discardReason: string | undefined = undefined;
      let isJunk = false;
      let isDuplicate = false;

      if (!isVisual) {
        discardReason = `visualScore (${card.visualScore ?? 0}) < ${AUTO_IMAGE_MIN_SCORE}`;
      } else if (!card.imageSearchQuery) {
        discardReason = "No imageSearchQuery generated";
      } else {
        console.log(`[ImageSearch] Searching for "${card.term}" with query: "${card.imageSearchQuery}"...`);
        try {
          const imgRes = await imageSearchService.searchImageForVocabulary(
            card.term,
            card.imageSearchQuery,
            { usedUrls: usedGlobalUrls }
          );

          if (imgRes.imageUrl) {
            if (usedGlobalUrls.has(imgRes.imageUrl)) {
              isDuplicate = true;
              discardReason = "Duplicate URL detected in batch";
            } else {
              imageUrl = imgRes.imageUrl;
              imageSource = imgRes.imageSource || "AUTO";
              usedGlobalUrls.add(imageUrl);

              // Check if junk
              if (isJunkImage({ imageUrl: imgRes.imageUrl, title: imgRes.imageSearchQuery || "" })) {
                isJunk = true;
              }
            }
          } else {
            discardReason = "No qualified candidate passed filter / no results";
          }
        } catch (searchErr) {
          console.error(`[ImageSearch] Failed for "${card.term}":`, searchErr);
          discardReason = "Search provider error";
        }
      }

      results.push({
        deck: deckName,
        term: card.term,
        meaningVi: card.meaningVi,
        definitionEn: card.definitionEn,
        exampleEn: card.exampleEn,
        visualScore: card.visualScore ?? 0,
        imageSearchQuery: card.imageSearchQuery,
        searchTriggered: shouldSearch,
        imageUrl,
        imageSource,
        discardReason,
        isJunk,
        isDuplicate,
      });

      // Brief delay between image searches to avoid rate limiting
      await sleep(400);
    }

    if (i + batchSize < items.length) {
      await sleep(1500); // Cool down between AI chunks
    }
  }

  return results;
}

async function smokeTestManualImage(): Promise<{ passed: boolean; details: string[] }> {
  const details: string[] = [];
  try {
    // 1. Upload mock PNG
    const mockPngBuffer = Buffer.from("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    const file = new File([mockPngBuffer], "manual_test.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);

    const postReq = new Request("http://localhost:3000/api/upload/image", {
      method: "POST",
      body: formData,
    });

    const postRes = await uploadPost(postReq);
    const postJson = await postRes.json();
    if (!postRes.ok || !postJson.success || !postJson.imageUrl) {
      throw new Error("Upload POST failed: " + JSON.stringify(postJson));
    }
    const uploadedUrl = postJson.imageUrl as string;
    const uploadedDiskPath = path.join(process.cwd(), "public", uploadedUrl);
    details.push(`Upload success: ${uploadedUrl} (exists on disk: ${fs.existsSync(uploadedDiskPath)})`);

    // 2. Test create or find card to associate
    const testDeck = await db.deck.findFirst({ include: { cards: true } });
    if (testDeck && testDeck.cards.length > 0) {
      const card = testDeck.cards[0];
      const origImageUrl = card.imageUrl;

      // Update card with manual image
      const updated = await deckService.updateCard(card.id, {
        imageUrl: uploadedUrl,
        imageSource: "MANUAL",
      });
      details.push(`Card updated with MANUAL source: ${updated.imageSource === "MANUAL"}`);

      // Replace card image with a dummy web url
      await deckService.updateCard(card.id, {
        imageUrl: "https://images.unsplash.com/photo-test-dummy",
        imageSource: "MANUAL",
      });

      // Check if uploadedDiskPath was deleted
      const cleanedUpOnReplace = !fs.existsSync(uploadedDiskPath);
      details.push(`Old local file deleted on replace: ${cleanedUpOnReplace}`);

      // Restore original card image
      await deckService.updateCard(card.id, {
        imageUrl: origImageUrl,
      });
    } else {
      // Direct DELETE API test
      const delReq = new Request(`http://localhost:3000/api/upload/image?url=${encodeURIComponent(uploadedUrl)}`, {
        method: "DELETE",
      });
      await uploadDelete(delReq);
      const cleanedUp = !fs.existsSync(uploadedDiskPath);
      details.push(`Local file deleted via DELETE API: ${cleanedUp}`);
    }

    return { passed: true, details };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    details.push(`Manual Smoke Test Failed: ${errorMsg}`);
    return { passed: false, details };
  }
}

async function runUAT() {
  console.log("================================================================================");
  console.log("STARTING LIVE UAT QUALITY REVIEW FOR WORDNEST IMAGE SYSTEM");
  console.log("================================================================================");

  const usedGlobalUrls = new Set<string>();

  const resultsA = await processBatch("Deck A (Concrete & Visual)", DECK_A_TERMS, usedGlobalUrls);
  await sleep(2000);

  const resultsB = await processBatch("Deck B (Abstract & Generic)", DECK_B_TERMS, usedGlobalUrls);
  await sleep(2000);

  const resultsC = await processBatch("Deck C (Polysemous / Ambiguous)", DECK_C_ITEMS, usedGlobalUrls);

  const manualSmoke = await smokeTestManualImage();

  const allResults = [...resultsA, ...resultsB, ...resultsC];

  // Compute Metrics
  const computeMetrics = (cards: CardUATResult[]) => {
    const total = cards.length;
    const withAutoImage = cards.filter((c) => c.imageUrl !== null).length;
    const withoutImage = cards.filter((c) => c.imageUrl === null).length;
    const duplicates = cards.filter((c) => c.isDuplicate).length;
    const junks = cards.filter((c) => c.isJunk).length;

    return {
      total,
      withAutoImage,
      withoutImage,
      autoImageRate: total > 0 ? ((withAutoImage / total) * 100).toFixed(1) + "%" : "0%",
      duplicates,
      junks,
    };
  };

  const metricsA = computeMetrics(resultsA);
  const metricsB = computeMetrics(resultsB);
  const metricsC = computeMetrics(resultsC);
  const metricsTotal = computeMetrics(allResults);

  // Write detailed JSON artifact
  const outputPath = path.join(process.cwd(), "uat-results.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        metrics: {
          DeckA: metricsA,
          DeckB: metricsB,
          DeckC: metricsC,
          Total: metricsTotal,
        },
        manualSmoke,
        cards: allResults,
      },
      null,
      2
    )
  );

  console.log("\n================================================================================");
  console.log("UAT EXECUTION FINISHED. OUTPUT SAVED TO:", outputPath);
  console.log("================================================================================");
  console.log("TOTAL METRICS:", metricsTotal);
  console.log("MANUAL SMOKE TEST:", manualSmoke);
}

runUAT().catch((err) => {
  console.error("FATAL UAT ERROR:", err);
  process.exit(1);
});
