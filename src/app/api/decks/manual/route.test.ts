import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/decks/manual", () => {
  it("rejects a manual card without a word", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cards: [{ meaningVi: "xử lý sự cố" }] }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects a manual card without a Vietnamese meaning", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cards: [{ term: "troubleshoot" }] }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects empty rows instead of creating an empty card", async () => {
    const response = await POST(
      new Request("http://localhost/api/decks/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cards: [{ term: "", meaningVi: "" }] }),
      })
    );

    expect(response.status).toBe(400);
  });
});
