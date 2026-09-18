import { db } from "../src/lib/db";
import { documentService } from "../src/services/document/document-service";
import { aiService } from "../src/services/ai";
import { deckService } from "../src/services/vocabulary/deck-service";

async function verifyPhase4() {
  console.log("==================================================");
  console.log("🚀 STARTING WORDNEST PHASE 4 VERIFICATION TEST");
  console.log("==================================================");

  // 1. Test Text Extraction from a document buffer
  const sampleDocumentContent = `
    The young researcher displayed meticulous attention to detail throughout her investigation.
    Despite countless setbacks and unpredictable obstacles, the entire team remained resilient and focused.
    A stroke of serendipity led to the discovery of a versatile compound that could revolutionize sustainable energy.
    However, the laboratory director was reluctant to publish the initial findings without exhaustive validation.
    She urged everyone to take responsibility for their methodology and uphold the highest academic rigor.
  `;

  console.log("\n1. Testing Document Text Extraction...");
  const textBuffer = Buffer.from(sampleDocumentContent, "utf-8");
  const extractedDoc = await documentService.extractText(
    textBuffer,
    "scientific_research_paper.txt",
    "text/plain"
  );

  console.log(`✅ Text extracted successfully:`);
  console.log(`   - Filename: ${extractedDoc.filename}`);
  console.log(`   - Detected Type: ${extractedDoc.fileType}`);
  console.log(`   - Word Count: ${extractedDoc.wordCount}`);
  console.log(`   - Preview: "${extractedDoc.text.substring(0, 120)}..."`);

  if (extractedDoc.wordCount < 20) {
    throw new Error("Extracted word count is lower than expected!");
  }

  // 2. Test AI Vocabulary Extraction from document
  console.log("\n2. Testing AI Vocabulary Extraction from extracted text...");
  const extractedItems = await aiService.extractVocabularyFromText(extractedDoc.text, {
    maxTerms: 10,
  });

  console.log(`✅ Extracted ${extractedItems.length} vocabulary items:`);
  for (let i = 0; i < Math.min(5, extractedItems.length); i++) {
    const item = extractedItems[i];
    console.log(`   [${i + 1}] "${item.term}" (${item.cefr}) - ${item.meaning}`);
    console.log(`       Frequency: ${item.frequency} | Sentence: "${item.originalSentence.substring(0, 80)}..."`);

    // Verify properties
    if (!item.term || !item.meaning || !item.cefr || !item.originalSentence) {
      throw new Error(`Item ${i + 1} lacks required fields!`);
    }
  }

  if (extractedItems.length === 0) {
    throw new Error("AI did not extract any vocabulary items!");
  }

  // 3. Test Flashcard Generation from Selected Document Items (New Deck)
  console.log("\n3. Testing Flashcard Generation from Selected Document Items (New Deck)...");
  // Select top 3 items
  const selectedItems = extractedItems.slice(0, 3).map((item) => ({
    term: item.term,
    meaning: item.meaning,
    cefr: item.cefr,
    originalSentence: item.originalSentence,
  }));

  const creationResult = await deckService.createCardsFromImport({
    deckName: "Phase 4 Document Vocabulary Deck",
    items: selectedItems,
  });

  console.log(`✅ Flashcards created in new deck:`);
  console.log(`   - Deck ID: ${creationResult.deckId}`);
  console.log(`   - Deck Name: "${creationResult.deckName}"`);
  console.log(`   - Cards Created: ${creationResult.cardsCreated}`);

  if (creationResult.cardsCreated !== selectedItems.length) {
    throw new Error(
      `Expected ${selectedItems.length} cards created, got ${creationResult.cardsCreated}`
    );
  }

  // Verify in MySQL
  const savedDeck = await db.deck.findUnique({
    where: { id: creationResult.deckId },
    include: { cards: true },
  });

  if (!savedDeck || savedDeck.cards.length !== selectedItems.length) {
    throw new Error("Deck or flashcards not properly persisted in MySQL!");
  }

  console.log(`✅ Verified ${savedDeck.cards.length} cards saved in MySQL:`);
  for (const card of savedDeck.cards) {
    console.log(`   - "${card.term}": ${card.meaningVi} (CEFR: ${card.cefr})`);
    console.log(`     Example: "${card.exampleEn}"`);
  }

  // 4. Test Adding Additional Document Items into Existing Deck (Duplicate Prevention)
  console.log("\n4. Testing adding more items into the existing deck...");
  const additionalItems = [
    // One duplicate of an existing card
    selectedItems[0],
    // One genuinely new term
    {
      term: "rigor",
      meaning: "sự nghiêm ngặt, tính chặt chẽ",
      cefr: "C1",
      originalSentence: "She urged everyone to uphold the highest academic rigor.",
    },
  ];

  const appendResult = await deckService.createCardsFromImport({
    deckId: savedDeck.id,
    items: additionalItems,
  });

  console.log(`✅ Append result:`);
  console.log(`   - Cards Created: ${appendResult.cardsCreated} (duplicate skipped, 1 new card added)`);

  if (appendResult.cardsCreated !== 1) {
    throw new Error(`Expected exactly 1 new card created, but got ${appendResult.cardsCreated}!`);
  }

  // 5. Cleanup
  console.log("\n5. Cleaning up verification artifacts from database...");
  await db.deck.delete({
    where: { id: savedDeck.id },
  });
  console.log("✅ Verification deck cleanly removed from MySQL.");

  console.log("\n==================================================");
  console.log("🎉 ALL PHASE 4 VERIFICATION TESTS PASSED 100%!");
  console.log("==================================================");
}

verifyPhase4()
  .catch((err) => {
    console.error("❌ Phase 4 verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
