import { describe, expect, it } from "vitest";
import { escapeCsvField } from "./csv-service";

describe("CSV export", () => {
  it("escapes portable CSV fields", () => {
    expect(escapeCsvField("simple")).toBe("simple");
    expect(escapeCsvField('with, "quotes"')).toBe('"with, ""quotes"""');
    expect(escapeCsvField("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(escapeCsvField(null)).toBe("");
  });
});
