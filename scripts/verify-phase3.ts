import { db } from "../src/lib/db";
import { deckService } from "../src/services/vocabulary/deck-service";
import { quizService } from "../src/services/vocabulary/quiz-service";
import { progressService } from "../src/services/vocabulary/progress-service";
import { FlashcardStatus } from "@prisma/client";

async function verifyPhase3() {
  console.log("==================================================");
  console.log("🚀 STARTING WORDNEST PHASE 3 VERIFICATION TEST");
  console.log("==================================================");

  // 1. Create a test deck
  const rawInput = "diligent; ubiquitous; meticulous; persistent";
  console.log(`\n1. Creating test deck with words: "${rawInput}"`);
  const deck = await deckService.createDeckWithCards(rawInput, "Phase 3 Verification Deck");
  if (!deck) throw new Error("Failed to create deck");
  console.log(`✅ Deck created: ID=${deck.id}, Cards=${deck.cards.length}`);

  // 2. Generate Quiz Questions
  console.log("\n2. Testing Quiz Question Generation...");
  const quizData = await quizService.getDeckQuiz(deck.id, 4);
  console.log(`✅ Generated ${quizData.questions.length} quiz questions for deck "${quizData.deck.name}":`);

  for (let i = 0; i < quizData.questions.length; i++) {
    const q = quizData.questions[i];
    console.log(`   [Q${i + 1}] Type: ${q.type}`);
    console.log(`        Prompt: "${q.prompt}"`);
    console.log(`        Options (${q.options.length}): [${q.options.join(" | ")}]`);
    console.log(`        Correct Answer: "${q.correctAnswer}"`);

    // Verify constraints
    if (q.options.length !== 4) {
      throw new Error(`Question ${i + 1} does not have exactly 4 options!`);
    }
    const uniqueOptions = new Set(q.options);
    if (uniqueOptions.size !== 4) {
      throw new Error(`Question ${i + 1} has duplicate options!`);
    }
    if (!q.options.includes(q.correctAnswer)) {
      throw new Error(`Question ${i + 1} options do not contain the correct answer!`);
    }
    if (!q.explanation.exampleEn || !q.explanation.meaningVi) {
      throw new Error(`Question ${i + 1} lacks complete explanation!`);
    }
  }

  // 3. Submit Quiz Attempt and Update Card Statuses
  console.log("\n3. Testing Quiz Submission and Card Status Updates...");
  const cardResults = [
    { cardId: deck.cards[0].id, correct: true },
    { cardId: deck.cards[1].id, correct: true },
    { cardId: deck.cards[2].id, correct: false },
    { cardId: deck.cards[3].id, correct: true },
  ];

  const score = cardResults.filter((c) => c.correct).length; // 3
  const total = cardResults.length; // 4
  const expectedAccuracy = Number(((3 / 4) * 100).toFixed(1)); // 75.0%

  const submissionResult = await quizService.submitQuizResult(deck.id, {
    score,
    total,
    cardResults,
    updateCardStatus: true,
  });

  console.log(`✅ Quiz submitted successfully:`);
  console.log(`   - Attempt ID: ${submissionResult.attemptId}`);
  console.log(`   - Score: ${submissionResult.score} / ${submissionResult.total}`);
  console.log(`   - Accuracy: ${submissionResult.accuracy}% (expected ${expectedAccuracy}%)`);
  console.log(`   - Cards updated: ${submissionResult.cardsUpdatedCount}`);

  if (submissionResult.accuracy !== expectedAccuracy) {
    throw new Error(`Accuracy mismatch! Expected ${expectedAccuracy}, got ${submissionResult.accuracy}`);
  }

  // Verify in MySQL database
  const savedAttempt = await db.quizAttempt.findUnique({
    where: { id: submissionResult.attemptId },
  });
  if (!savedAttempt) {
    throw new Error("QuizAttempt was not found in MySQL database!");
  }
  console.log(`✅ Verified QuizAttempt row in MySQL (id: ${savedAttempt.id}, score: ${savedAttempt.score}/${savedAttempt.total})`);

  // Verify Flashcard statuses
  const updatedCards = await db.flashcard.findMany({
    where: { deckId: deck.id },
  });

  const card1 = updatedCards.find((c) => c.id === deck.cards[0].id);
  const card3 = updatedCards.find((c) => c.id === deck.cards[2].id);

  console.log(`   - Correct Card 1 status: ${card1?.status} (expected: KNOWN)`);
  console.log(`   - Incorrect Card 3 status: ${card3?.status} (expected: LEARNING)`);

  if (card1?.status !== FlashcardStatus.KNOWN) {
    throw new Error(`Expected Card 1 to be KNOWN, but found ${card1?.status}`);
  }
  if (card3?.status !== FlashcardStatus.LEARNING) {
    throw new Error(`Expected Card 3 to be LEARNING, but found ${card3?.status}`);
  }
  console.log(`✅ Flashcard statuses correctly updated based on quiz answers!`);

  // 4. Test Progress Service Aggregations
  console.log("\n4. Testing Progress Dashboard Aggregation Service...");
  const progressSummary = await progressService.getProgressSummary();

  console.log(`✅ Global Progress Statistics:`);
  console.log(`   - Total Decks: ${progressSummary.stats.totalDecks}`);
  console.log(`   - Total Cards: ${progressSummary.stats.totalCards}`);
  console.log(`   - Known (Mastered): ${progressSummary.stats.knownCount}`);
  console.log(`   - Learning: ${progressSummary.stats.learningCount}`);
  console.log(`   - New: ${progressSummary.stats.newCount}`);
  console.log(`   - Global Mastery Rate: ${progressSummary.stats.masteryRate}%`);
  console.log(`   - Total Quiz Attempts: ${progressSummary.stats.totalQuizAttempts}`);
  console.log(`   - Overall Quiz Accuracy: ${progressSummary.stats.overallAccuracy}%`);

  const deckProgress = progressSummary.decks.find((d) => d.id === deck.id);
  if (!deckProgress) {
    throw new Error(`Deck progress for ${deck.id} not found in progress summary!`);
  }

  console.log(`✅ Deck-specific progress verified:`);
  console.log(`   - Deck Name: "${deckProgress.name}"`);
  console.log(`   - Total Cards: ${deckProgress.totalCards}`);
  console.log(`   - Known: ${deckProgress.knownCount}, Learning: ${deckProgress.learningCount}`);
  console.log(`   - Mastery Rate: ${deckProgress.masteryRate}%`);
  console.log(`   - Quiz Attempts: ${deckProgress.quizAttemptsCount}`);
  console.log(`   - Last Quiz Accuracy: ${deckProgress.lastQuizAccuracy}%`);

  if (deckProgress.knownCount !== 3 || deckProgress.learningCount !== 1) {
    throw new Error(`Deck progress status counts incorrect!`);
  }
  if (deckProgress.lastQuizAccuracy !== 75.0) {
    throw new Error(`Deck last quiz accuracy incorrect!`);
  }

  // 5. Cleanup
  console.log("\n5. Cleaning up verification artifacts...");
  await db.deck.delete({
    where: { id: deck.id },
  });
  console.log("✅ Verification deck and associated attempts cleanly deleted.");

  console.log("\n==================================================");
  console.log("🎉 ALL PHASE 3 VERIFICATION TESTS PASSED 100%!");
  console.log("==================================================");
}

verifyPhase3()
  .catch((err) => {
    console.error("❌ Phase 3 verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
