import { describe, expect, it } from "vitest";
import { isIosDevice, isPwaSecureContext, isSafePwaUpdatePath, isStandalonePwa, type PwaWindow } from "./pwa";

function browserContext({ standalone = false, displayMode = false, secure = true } = {}) {
  return {
    isSecureContext: secure,
    navigator: { userAgent: "Mozilla/5.0 (iPhone)", standalone },
    matchMedia: () => ({ matches: displayMode }),
  } satisfies PwaWindow;
}

describe("PWA environment helpers", () => {
  it("recognizes both standard and iOS standalone signals", () => {
    expect(isStandalonePwa(browserContext({ standalone: true }))).toBe(true);
    expect(isStandalonePwa(browserContext({ displayMode: true }))).toBe(true);
    expect(isStandalonePwa(browserContext())).toBe(false);
  });

  it("identifies iOS and secure contexts without inferring server reachability", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 15)")).toBe(false);
    expect(isPwaSecureContext(browserContext({ secure: true }))).toBe(true);
    expect(isPwaSecureContext(browserContext({ secure: false }))).toBe(false);
  });

  it("defers update prompts on active learning routes", () => {
    expect(isSafePwaUpdatePath("/")).toBe(true);
    expect(isSafePwaUpdatePath("/decks/deck-1")).toBe(true);
    expect(isSafePwaUpdatePath("/review")).toBe(false);
    expect(isSafePwaUpdatePath("/folders/folder-1/review")).toBe(false);
    expect(isSafePwaUpdatePath("/decks/deck-1/study")).toBe(false);
    expect(isSafePwaUpdatePath("/decks/deck-1/quiz")).toBe(false);
    expect(isSafePwaUpdatePath("/decks/deck-1/practice")).toBe(false);
  });
});
