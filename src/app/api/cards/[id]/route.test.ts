import { describe, expect, it } from "vitest";
import { DELETE } from "./route";

describe("DELETE /api/cards/[id]", () => {
  it("returns 404 for a card that does not exist", async () => {
    const response = await DELETE(new Request("http://localhost/api/cards/missing-card"), {
      params: Promise.resolve({ id: "missing-card" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
