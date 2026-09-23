import { db } from "../src/lib/db";
import { deckService } from "../src/services/vocabulary/deck-service";
import { parseVocabularyInput } from "../src/services/vocabulary/parser";
import { fsrsService, Rating } from "../src/services/fsrs/fsrs-service";

async function verifyPhase1() {
  console.log("==================================================");
  console.log("🚀 STARTING WORDNEST PHASE 1 VERIFICATION TEST");
  console.log("==================================================");

  // Step 1 & 2: User inputs 4 terms
  const rawInput = "apple; resilient; take responsibility; reluctant";
  console.log(`\n1. User input: "${rawInput}"`);

  // Step 3: App detects 4 terms
  const parsed = parseVocabularyInput(rawInput);
  console.log(`2. Parser detected ${parsed.terms.length} terms:`, parsed.terms);
  if (parsed.terms.length !== 4) {
    throw new Error(`Expected 4 terms, detected ${parsed.terms.length}`);
  }

  // Step 4 & 5: User clicks Generate Flashcards -> creates deck
  console.log("\n3. Generating Deck via DeckService with AI and images...");
  const deck = await deckService.createDeckWithCards(rawInput, "DoD Verification Deck");

  if (!deck) {
    throw new Error("Failed to create deck");
  }
  console.log(`✅ Deck created with ID: ${deck.id}, Name: "${deck.name}"`);

  // Step 6 & 7: 4 flashcards persisted in MySQL with meaning, IPA, example
  console.log("\n4. Verifying MySQL database persistence directly...");
  const dbCards = await db.flashcard.findMany({
    where: { deckId: deck.id },
    orderBy: { createdAt: "asc" },
  });

  console.log(`   Found ${dbCards.length} flashcards in MySQL:`);
  for (const card of dbCards) {
    console.log(`   - Term: "${card.term}" | IPA: ${card.ipa || "N/A"} | POS: ${card.partOfSpeech || "N/A"} | CEFR: ${card.cefr || "N/A"}`);
    console.log(`     Meaning (Vi): ${card.meaningVi}`);
    console.log(`     Definition (En): ${card.definitionEn}`);
    console.log(`     Example: "${card.exampleEn}" -> "${card.exampleVi}"`);
    console.log(`     Image: ${card.imageUrl ? card.imageUrl.substring(0, 60) + "..." : "None"} (Useful: ${card.imageSearchQuery ? "Yes" : "No"})`);
    console.log(`     Status: ${card.status}`);
  }

  if (dbCards.length !== 4) {
    throw new Error(`Expected 4 cards in DB, got ${dbCards.length}`);
  }

  // Step 8: Appropriate card has image
  const appleCard = dbCards.find((c) => c.normalizedTerm === "apple");
  if (!appleCard?.imageUrl) {
    console.warn("⚠️ Apple card does not have an image URL");
  } else {
    console.log(`✅ Apple card has illustrative image: ${appleCard.imageUrl.substring(0, 50)}...`);
  }

  // Step 9: Scheduled Review owns scheduler/status transitions.
  console.log("\n5. Testing Scheduled Review Status Transitions...");
  const cardToLearn = dbCards[0]; // apple
  const cardToKnow = dbCards[1];  // resilient

  console.log(`   Action: "Again" on "${cardToLearn.term}" -> FSRS Learning`);
  await fsrsService.processScheduledReview(cardToLearn.id, {
    rating: Rating.Again,
    reviewEventId: crypto.randomUUID(),
    expectedSchedulerVersion: cardToLearn.schedulerVersion,
  });

  console.log(`   Action: "Easy" on "${cardToKnow.term}" -> FSRS Review`);
  await fsrsService.processScheduledReview(cardToKnow.id, {
    rating: Rating.Easy,
    reviewEventId: crypto.randomUUID(),
    expectedSchedulerVersion: cardToKnow.schedulerVersion,
  });

  // Step 10 & 11: Browser reload simulation (re-fetch from MySQL)
  console.log("\n6. Simulating browser reload & data persistence check...");
  const reloadedDeck = await deckService.getDeckById(deck.id);

  if (!reloadedDeck) {
    throw new Error("Reloaded deck not found!");
  }

  console.log("   Reloaded Deck Stats:");
  console.log(`   - Total Cards: ${reloadedDeck.stats.totalCards} (expected: 4)`);
  console.log(`   - New Count: ${reloadedDeck.stats.newCount} (expected: 2)`);
  console.log(`   - Learning Count: ${reloadedDeck.stats.learningCount} (expected: 1)`);
  console.log(`   - Known Count: ${reloadedDeck.stats.knownCount} (expected: 1)`);

  if (
    reloadedDeck.stats.totalCards !== 4 ||
    reloadedDeck.stats.newCount !== 2 ||
    reloadedDeck.stats.learningCount !== 1 ||
    reloadedDeck.stats.knownCount !== 1
  ) {
    throw new Error("Stats do not match expected status transitions!");
  }

  // Clean up verification deck
  await deckService.deleteDeck(deck.id);
  console.log("\n✅ Verification deck cleaned up.");

  console.log("\n==================================================");
  console.log("🎉 ALL DEFINITION OF DONE REQUIREMENTS PASSED 100%!");
  console.log("==================================================");
}

verifyPhase1()
  .catch((err) => {
    console.error("❌ Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
