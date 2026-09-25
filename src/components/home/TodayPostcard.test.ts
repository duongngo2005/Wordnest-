import { describe, it, expect } from "vitest";
import { getPostcardState } from "./TodayPostcard";

describe("TodayPostcard logic and state mappings", () => {
  const testDate = new Date("2026-09-24T12:00:00Z");

  it("returns 'due' state with reading mascot and due quote when cards are waiting", () => {
    const state = getPostcardState(8, 0, testDate);
    expect(state.type).toBe("due");
    expect(state.mascotMood).toBe("reading");
    expect(typeof state.quote).toBe("string");
    expect(state.quote.length).toBeGreaterThan(0);
  });

  it("returns 'in_progress' state with thinking mascot when studying is in progress", () => {
    const state = getPostcardState(5, 3, testDate);
    expect(state.type).toBe("in_progress");
    expect(state.mascotMood).toBe("thinking");
    expect(typeof state.quote).toBe("string");
    expect(state.quote.length).toBeGreaterThan(0);
  });

  it("returns 'completed' state with celebrating mascot when all cards for today are done", () => {
    const state = getPostcardState(0, 11, testDate);
    expect(state.type).toBe("completed");
    expect(state.mascotMood).toBe("celebrating");
    expect(typeof state.quote).toBe("string");
    expect(state.quote.length).toBeGreaterThan(0);
  });

  it("returns 'clean_slate' state with happy mascot when there are 0 cards due and 0 reviewed", () => {
    const state = getPostcardState(0, 0, testDate);
    expect(state.type).toBe("clean_slate");
    expect(state.mascotMood).toBe("happy");
    expect(typeof state.quote).toBe("string");
    expect(state.quote.length).toBeGreaterThan(0);
  });

  it("yields consistent deterministic quotes for the same date", () => {
    const state1 = getPostcardState(4, 2, testDate);
    const state2 = getPostcardState(4, 2, testDate);
    expect(state1.quote).toBe(state2.quote);
  });
});
