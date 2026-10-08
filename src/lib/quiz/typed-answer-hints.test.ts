import { describe, expect, it } from "vitest";
import { createTypedAnswerHints } from "./typed-answer-hints";

describe("createTypedAnswerHints", () => {
  it("creates the requested partial-letter and blank-only hints", () => {
    expect(createTypedAnswerHints("express")).toEqual({
      partial: "_x_re__",
      blank: "_______",
    });
  });

  it("keeps word separators visible while masking a phrase", () => {
    expect(createTypedAnswerHints("look up")).toEqual({
      partial: "_o_k _p",
      blank: "____ __",
    });
  });
});
