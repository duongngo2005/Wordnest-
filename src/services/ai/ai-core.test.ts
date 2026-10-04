import { describe, expect, it } from "vitest";
import { AIParseError, cleanAndParseJson } from "./ai-core";

describe("cleanAndParseJson", () => {
  it("parses JSON surrounded by a code fence or conversational text", () => {
    expect(cleanAndParseJson<{ term: string }>("```json\n{\"term\":\"lucid\"}\n```"))
      .toEqual({ term: "lucid" });
    expect(cleanAndParseJson<{ term: string }>("Here is the result: {\"term\":\"lucid\"}"))
      .toEqual({ term: "lucid" });
  });

  it("preserves commas inside strings while removing trailing JSON commas", () => {
    expect(cleanAndParseJson<{ note: string }>("{\"note\":\"Keep this comma, }\",}"))
      .toEqual({ note: "Keep this comma, }" });
  });

  it("rejects content that does not contain JSON", () => {
    expect(() => cleanAndParseJson("This is not JSON.")).toThrow(AIParseError);
  });
});
