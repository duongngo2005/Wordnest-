/**
 * WordNest Physical UI Sound Foundation
 *
 * Implements organic, paper/wood/percussive tactile feedback using Web Audio API.
 * - Zero external sound files (0 network latency, 0 broken URLs, 100% offline & PWA friendly)
 * - Volume controlled by user preference (default: low, non-intrusive)
 * - Safe for mobile Safari (unlocks on user gesture, never blocks execution)
 * - Automatic cleanup of audio nodes to prevent memory leaks
 */

import { getUISoundPreferences } from "./ui-sound-preferences";

export type UISoundType = "paperFlip" | "softTap" | "success" | "completion" | "error";

// AudioContext singleton reference
let audioCtx: AudioContext | null = null;
const lastPlayedAt: Record<string, number> = {};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === "suspended") {
      // Resume on user interaction
      void audioCtx.resume().catch(() => {});
    }

    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Creates a brief paper rustle / card flip effect
 * Using filtered white noise with a soft envelope
 */
function playPaperFlip(ctx: AudioContext, masterGain: GainNode, volume: number) {
  const duration = 0.08; // 80ms
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Fill with low-amplitude noise
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Bandpass filter to sound like paper rather than static hiss
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1400, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + duration);
  filter.Q.setValueAtTime(1.2, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume * 0.45, ctx.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  noise.start();
  noise.stop(ctx.currentTime + duration);

  noise.onended = () => {
    noise.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

/**
 * Creates a woody / ceramic soft tap for button and key presses
 */
function playSoftTap(ctx: AudioContext, masterGain: GainNode, volume: number) {
  const duration = 0.045; // 45ms
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Gentle frequency drop simulating a small mechanical switch or wooden block
  osc.type = "triangle";
  osc.frequency.setValueAtTime(260, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + duration);

  gain.gain.setValueAtTime(volume * 0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start();
  osc.stop(ctx.currentTime + duration);

  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/**
 * Creates a warm, gentle chime for success / save confirmation
 */
function playSuccess(ctx: AudioContext, masterGain: GainNode, volume: number) {
  const notes = [523.25, 659.25]; // C5 -> E5
  const noteDuration = 0.08;

  notes.forEach((freq, idx) => {
    const startTime = ctx.currentTime + idx * 0.06;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume * 0.28, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.05);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(startTime);
    osc.stop(startTime + noteDuration + 0.05);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  });
}

/**
 * Creates a pleasant, soothing 3-note organic chord for lesson/session completion
 */
function playCompletion(ctx: AudioContext, masterGain: GainNode, volume: number) {
  const notes = [440.0, 554.37, 659.25]; // A4, C#5, E5
  const duration = 0.26;

  notes.forEach((freq, idx) => {
    const startTime = ctx.currentTime + idx * 0.05;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume * 0.22, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  });
}

/**
 * Creates a subtle, soft low bump for warnings / errors
 */
function playError(ctx: AudioContext, masterGain: GainNode, volume: number) {
  const duration = 0.09;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(140, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(85, ctx.currentTime + duration);

  gain.gain.setValueAtTime(volume * 0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start();
  osc.stop(ctx.currentTime + duration);

  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/**
 * Play a physical UI feedback sound.
 * Safe to call anywhere: checks user settings, handles browser restrictions,
 * and will never throw an unhandled error or break the interface.
 */
export function playUISound(type: UISoundType): void {
  try {
    const prefs = getUISoundPreferences();
    if (!prefs.enabled) return;

    // Throttle duplicate sounds (minimum 40ms)
    const now = Date.now();
    if (lastPlayedAt[type] && now - lastPlayedAt[type] < 40) {
      return;
    }
    lastPlayedAt[type] = now;

    const ctx = getAudioContext();
    if (!ctx) return;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(prefs.volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    switch (type) {
      case "paperFlip":
        playPaperFlip(ctx, masterGain, prefs.volume);
        break;
      case "softTap":
        playSoftTap(ctx, masterGain, prefs.volume);
        break;
      case "success":
        playSuccess(ctx, masterGain, prefs.volume);
        break;
      case "completion":
        playCompletion(ctx, masterGain, prefs.volume);
        break;
      case "error":
        playError(ctx, masterGain, prefs.volume);
        break;
    }
  } catch {
    // Audio failures should never block or crash the UI
  }
}
