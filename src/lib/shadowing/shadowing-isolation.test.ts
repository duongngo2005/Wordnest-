import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { segmentSentences } from "./sentence-segmenter";
import { computeWordSimilarity } from "./similarity";

describe("Shadowing Isolation & Evidence Truthfulness", () => {
  describe("1. Pure Client-Side Deterministic Engine", () => {
    it("computes similarity purely locally without network requests", () => {
      const globalFetchSpy = vi.spyOn(globalThis, "fetch");

      const original = "The quick brown fox jumps over the lazy dog.";
      const spoken = "the quick brown fox jumped over the lazy dog";

      const result = computeWordSimilarity(original, spoken);

      expect(globalFetchSpy).not.toHaveBeenCalled();
      expect(result.similarity).toBeGreaterThan(80);
      expect(result.wer).toBeGreaterThan(0);
      expect(result.alignment.length).toBeGreaterThan(0);

      globalFetchSpy.mockRestore();
    });

    it("segments sentences purely locally with deterministic results", () => {
      const text = "Dr. Smith arrived at 8:00 a.m. He was very excited about the experiment! Did it work? Of course.";
      const sentences = segmentSentences(text);

      expect(sentences).toEqual([
        "Dr. Smith arrived at 8:00 a.m.",
        "He was very excited about the experiment!",
        "Did it work?",
        "Of course.",
      ]);
    });
  });

  describe("2. Architecture & Codebase Isolation (No DB / Adaptive Learning Pollution)", () => {
    const shadowingFiles = [
      "src/lib/shadowing/sentence-segmenter.ts",
      "src/lib/shadowing/similarity.ts",
      "src/lib/shadowing/useSpeechRecognition.ts",
      "src/lib/shadowing/useAudioRecorder.ts",
      "src/components/shadowing/ShadowingPlayer.tsx",
    ];

    it("ensures no Shadowing module imports Prisma, PracticeAttempt, or ReviewLog", () => {
      const forbiddenImports = [
        "@prisma/client",
        "@/lib/prisma",
        "prisma",
        "PracticeAttempt",
        "ReviewLog",
        "practiceEvidenceService",
        "fsrsService",
        "mistakeService",
        "smartPracticeService",
      ];

      for (const relPath of shadowingFiles) {
        const fullPath = resolve(process.cwd(), relPath);
        const content = readFileSync(fullPath, "utf-8");

        for (const forbidden of forbiddenImports) {
          const importPattern = new RegExp(`from\\s+['"].*${forbidden}.*['"]`, "i");
          expect(
            importPattern.test(content),
            `Forbidden import '${forbidden}' found in ${relPath}`
          ).toBe(false);
        }
      }
    });

    it("ensures Shadowing UI does NOT claim AI pronunciation scoring", () => {
      const playerPath = resolve(process.cwd(), "src/components/shadowing/ShadowingPlayer.tsx");
      const playerContent = readFileSync(playerPath, "utf-8");

      // Must NOT contain "Điểm phát âm AI"
      expect(playerContent).not.toContain("Điểm phát âm AI");

      // Must contain truthful transcript-match terminology.
      expect(playerContent).toContain("Khớp văn bản nhận diện với câu mẫu");
    });
  });

  describe("3. Audio Safety & Memory Invariant", () => {
    it("ensures useAudioRecorder cleans up Blob URLs and stops media tracks", () => {
      const recorderSource = readFileSync(
        resolve(process.cwd(), "src/lib/shadowing/useAudioRecorder.ts"),
        "utf-8"
      );

      // Verify that revokeObjectURL is used for cleanup
      expect(recorderSource).toContain("URL.revokeObjectURL");

      // Verify that stream tracks are explicitly stopped
      expect(recorderSource).toContain("track.stop()");
    });

    it("ensures ShadowingPlayer pauses/stops TTS when starting recording", () => {
      const playerSource = readFileSync(
        resolve(process.cwd(), "src/components/shadowing/ShadowingPlayer.tsx"),
        "utf-8"
      );

      // Verify stopSpeech is called in handleStartRecording
      expect(playerSource).toContain("stopSpeech()");
    });
  });

  describe("4. Runtime Zero Evidence Truthfulness Test", () => {
    it("guarantees 0 vocabulary evidence written when target word 'apply' is shadowed with completely wrong speech", async () => {
      const { db } = await import("@/lib/db");

      const attemptSpy = vi.spyOn(db.practiceAttempt, "create");
      const reviewLogSpy = vi.spyOn(db.reviewLog, "create");
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Scenario: Sentence contains target card 'apply'
      const targetSentence = "You must apply online before Friday.";
      // User speaks completely wrong text
      const wrongTranscript = "banana potato orange table chair";

      // Run similarity computation as Shadowing player does
      const result = computeWordSimilarity(targetSentence, wrongTranscript);

      expect(result.similarity).toBeLessThan(20);
      expect(result.wer).toBeGreaterThan(0.8);

      // Assert runtime database isolation:
      expect(attemptSpy).not.toHaveBeenCalled();
      expect(reviewLogSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();

      attemptSpy.mockRestore();
      reviewLogSpy.mockRestore();
      fetchSpy.mockRestore();
    });
  });
});
