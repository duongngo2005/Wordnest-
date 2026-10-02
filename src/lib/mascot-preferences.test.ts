import { describe, expect, it } from "vitest";
import { DEFAULT_MASCOT_ID, parseMascotId } from "./mascot-preferences";

describe("mascot preferences", () => {
  it("uses Nesty when no mascot was stored", () => {
    expect(parseMascotId(null)).toBe(DEFAULT_MASCOT_ID);
  });

  it("restores the supported Dino selection", () => {
    expect(parseMascotId("dino")).toBe("dino");
  });

  it("restores the supported Knight selection", () => {
    expect(parseMascotId("knight")).toBe("knight");
  });

  it("safely ignores an unsupported stored value", () => {
    expect(parseMascotId("not-a-mascot")).toBe(DEFAULT_MASCOT_ID);
  });
});
