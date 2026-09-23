import { describe, expect, it } from "vitest";
import { PATCH } from "./route";

describe("PATCH /api/cards/[id]/status", () => {
  it("rejects manual scheduler status changes", async () => {
    const response = await PATCH();

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
