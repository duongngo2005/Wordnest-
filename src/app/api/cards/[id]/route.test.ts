import { describe, expect, it } from "vitest";
import { DELETE } from "./route";

describe("DELETE /api/cards/[id]", () => {
  it("requires the source Deck instead of exposing global vocabulary deletion", async () => {
    const response = await DELETE(new Request("http://localhost/api/cards/missing-card"), {
      params: Promise.resolve({ id: "missing-card" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: expect.any(String) });
  });
});
