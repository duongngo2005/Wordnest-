import { db } from "../src/lib/db";
import { deckService } from "../src/services/vocabulary/deck-service";
import { storyService } from "../src/services/vocabulary/story-service";
import { aiService } from "../src/services/ai";

async function verifyPhase2() {
  console.log("==================================================");
  console.log("🚀 STARTING WORDNEST PHASE 2 VERIFICATION TEST");
  console.log("==================================================");

  // 1. Create base deck
  const rawInput = "apple; resilient; take responsibility; reluctant";
  console.log(`\n1. Creating base deck with input: "${rawInput}"`);
  const deck = await deckService.createDeckWithCards(rawInput, "Phase 2 Verification Deck");
  if (!deck) throw new Error("Base deck creation failed");
  console.log(`✅ Base deck created: ID=${deck.id}, Cards=${deck.cards.length}`);

  // 2. Generate Story with Options
  console.log("\n2. Generating Story from selected target words...");
  const targetWords = ["apple", "resilient", "reluctant"];
  const story = await storyService.createStory({
    deckId: deck.id,
    targetWords,
    cefr: "B2",
    length: "medium",
    topic: "Mystery",
  });

  console.log(`✅ Story generated & saved to MySQL:`);
  console.log(`   - ID: ${story.id}`);
  console.log(`   - Title: "${story.title}"`);
  console.log(`   - Topic: ${story.topic} | CEFR: ${story.cefr} | Length: ${story.length}`);
  console.log(`   - Word Count: ~${story.content.split(/\s+/).length} words`);
  console.log(`   - Content Preview: "${story.content.substring(0, 150)}..."`);

  // 3. Test Translate-in-Context
  console.log("\n3. Testing Translate-in-Context for a term in the story...");
  const selectedWord = "resilient";
  const sentence = "Maya remained resilient despite the strange footprints outside the library.";
  const translation = await aiService.translateInContext({
    selectedText: selectedWord,
    surroundingSentence: sentence,
    context: story.title,
  });

  console.log(`✅ Contextual Translation result:`);
  console.log(`   - Term: "${translation.selectedText}" | IPA: ${translation.ipa || "N/A"}`);
  console.log(`   - Meaning (Vi): ${translation.meaningVi}`);
  console.log(`   - Contextual Meaning: ${translation.contextualMeaningVi}`);
  console.log(`   - Definition (En): ${translation.definitionEn}`);
  console.log(`   - Example Translation: "${translation.exampleEn}" -> "${translation.exampleVi}"`);

  // 4. Test Add Flashcard from Story
  console.log("\n4. Testing 'Add to Flashcards' from Story...");
  const newTerm = "footprints";
  const addResult = await storyService.addCardFromStory({
    deckId: deck.id,
    term: newTerm,
    meaningVi: "dấu chân, vết chân",
    definitionEn: "the mark left by a foot or shoe on the ground",
    ipa: "/ˈfʊt.prɪnts/",
    partOfSpeech: "noun",
    cefr: "A2",
    exampleEn: sentence,
    exampleVi: "Maya vẫn kiên cường bất chấp những dấu chân kỳ lạ bên ngoài thư viện.",
  });

  if (!addResult.success || addResult.alreadyExists) {
    throw new Error("Failed to add new card from story");
  }
  console.log(`✅ Added new card "${newTerm}" from story to deck.`);

  // 5. Verify card count in MySQL
  const updatedDeck = await deckService.getDeckById(deck.id);
  console.log(`   Updated Deck Total Cards: ${updatedDeck?.cards.length} (expected: 5)`);
  if (updatedDeck?.cards.length !== 5) {
    throw new Error(`Expected 5 cards, got ${updatedDeck?.cards.length}`);
  }

  // 6. Test Duplicate Prevention when adding from Story
  console.log("\n5. Testing duplicate prevention when re-adding existing card...");
  const duplicateAttempt = await storyService.addCardFromStory({
    deckId: deck.id,
    term: "Apple", // already exists
    meaningVi: "quả táo",
    definitionEn: "a fruit",
    exampleEn: "She ate an apple.",
    exampleVi: "Cô ấy ăn một quả táo.",
  });

  if (duplicateAttempt.success || !duplicateAttempt.alreadyExists) {
    throw new Error("Duplicate prevention failed!");
  }
  console.log(`✅ Duplicate prevented gracefully: "${duplicateAttempt.message}"`);

  // Clean up
  await deckService.deleteDeck(deck.id);
  console.log("\n✅ Test deck and stories cleaned up.");

  console.log("\n==================================================");
  console.log("🎉 ALL PHASE 2 REQUIREMENTS PASSED 100%!");
  console.log("==================================================");
}

verifyPhase2()
  .catch((err) => {
    console.error("❌ Phase 2 verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
