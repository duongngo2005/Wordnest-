import { describe, it, expect } from "vitest";
import {
  BUTTON_INTERACTION,
  CARD_INTERACTION,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  getPrefersReducedMotion,
  modalVariants,
  panelVariants,
} from "./motion-tokens";

describe("motion-tokens", () => {
  it("defines standard durations and easings", () => {
    expect(MOTION_DURATIONS.fast).toBe(140);
    expect(MOTION_DURATIONS.normal).toBe(220);
    expect(MOTION_DURATIONS.slow).toBe(320);
    expect(MOTION_EASINGS.tactile).toBeDefined();
    expect(MOTION_EASINGS.paper).toBeDefined();
  });

  it("defines standard button press and card hover interaction offsets", () => {
    expect(BUTTON_INTERACTION.hover).toEqual({ y: -1, x: -1 });
    expect(BUTTON_INTERACTION.tap).toEqual({ y: 2, x: 1 });
    expect(CARD_INTERACTION.hover).toEqual({ y: -2 });
    expect(CARD_INTERACTION.tap).toEqual({ y: 1 });
  });

  it("safely queries prefers-reduced-motion", () => {
    const isReduced = getPrefersReducedMotion();
    expect(typeof isReduced).toBe("boolean");
  });

  it("exports valid motion variants for panels and modals", () => {
    expect(panelVariants.hidden.opacity).toBe(0);
    expect(panelVariants.visible.opacity).toBe(1);
    expect(modalVariants.hidden.scale).toBeLessThan(1);
    expect(modalVariants.visible.scale).toBe(1);
  });
});
