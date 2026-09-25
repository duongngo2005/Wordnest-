import confetti from "canvas-confetti";
import { getPrefersReducedMotion } from "./motion-tokens";

/**
 * WordNest Warm Retro Study Celebration Confetti
 * Fires a brief, tasteful burst of warm earth-tone paper confetti
 * when a study session is successfully completed.
 */
export function fireSessionCompletionConfetti(): void {
  if (typeof window === "undefined") return;
  if (getPrefersReducedMotion()) return;

  try {
    const colors = [
      "#E06B43", // Terracotta
      "#F59E0B", // Vintage Brick Gold
      "#15803D", // Brick Green
      "#0284C7", // Soft Blue
      "#F4EFE6", // Warm Cream Paper
    ];

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors,
      ticks: 160,
      gravity: 1.1,
      scalar: 0.9,
      disableForReducedMotion: true,
    });
  } catch {
    // Graceful fallback if canvas is unsupported
  }
}
