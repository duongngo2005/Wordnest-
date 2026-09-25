/**
 * WordNest Motion Tokens & Physical Interaction System
 *
 * Defines centralized timing, easings, and reusable motion variants
 * for a retro-vintage, paper-and-brick tactile interface.
 */

// Timing tokens (milliseconds)
export const MOTION_DURATIONS = {
  instant: 0,
  fast: 140,     // button presses, quick switches, chip toggles
  normal: 220,   // card hovers, tabs, accordions, toast entrances
  slow: 320,     // panel transitions, modal backdrop fade
} as const;

// Transition timings in seconds for motion/react
export const MOTION_SECONDS = {
  fast: MOTION_DURATIONS.fast / 1000,
  normal: MOTION_DURATIONS.normal / 1000,
  slow: MOTION_DURATIONS.slow / 1000,
} as const;

// Easing curves: snappy retro mechanical spring-like decelerations
export const MOTION_EASINGS = {
  // Snappy deceleration - feels like pressing a physical key or button
  tactile: [0.2, 0.8, 0.2, 1] as const,
  // Smooth entrance curve
  enter: [0, 0, 0.2, 1] as const,
  // Quick exit curve
  exit: [0.4, 0, 1, 1] as const,
  // Natural paper sliding curve
  paper: [0.25, 1, 0.5, 1] as const,
};

// Physics springs for tactile elements
export const MOTION_SPRINGS = {
  // Firm, snappy spring for tactile buttons
  button: {
    type: "spring",
    stiffness: 500,
    damping: 32,
    mass: 0.8,
  } as const,
  // Soft, cushioned spring for interactive cards
  card: {
    type: "spring",
    stiffness: 380,
    damping: 26,
    mass: 1,
  } as const,
  // Gentle spring for modals, sheets, and popovers
  modal: {
    type: "spring",
    stiffness: 320,
    damping: 28,
  } as const,
  // Reduced motion fallback (instant or subtle opacity only)
  reduced: {
    duration: 0.01,
  } as const,
};

/**
 * Check if the user agent prefers reduced motion.
 * Always safely defaults to false in SSR / non-browser environments.
 */
export function getPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !("matchMedia" in window)) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Standard tactile button press motion tokens:
 * - Hover: lifts 1px up and 1px left (-1px, -1px)
 * - Press / Tap: pushes 1px down and 2px right (1px, 2px)
 * - Shadow compresses down to 0
 */
export const BUTTON_INTERACTION = {
  hover: { y: -1, x: -1 },
  tap: { y: 2, x: 1 },
} as const;

/**
 * Standard interactive card motion tokens:
 * - Hover: lifts 2px up (-2px)
 * - Press / Tap: resets or presses slightly down (1px)
 */
export const CARD_INTERACTION = {
  hover: { y: -2 },
  tap: { y: 1 },
} as const;

/**
 * Reusable motion variants for framer-motion / motion/react
 */
export const panelVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_SECONDS.normal,
      ease: MOTION_EASINGS.paper,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: MOTION_SECONDS.fast,
      ease: MOTION_EASINGS.exit,
    },
  },
};

export const modalVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: MOTION_SPRINGS.modal,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 6,
    transition: {
      duration: MOTION_SECONDS.fast,
      ease: MOTION_EASINGS.exit,
    },
  },
};
