import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { onlineActivityService } from "./online-activity-service";

afterEach(async () => {
  await db.dailyOnlineActivity.deleteMany();
});

describe("OnlineActivityService", () => {
  it("increments the daily foreground total instead of creating per-event history", async () => {
    await onlineActivityService.recordActiveSeconds(30, "UTC");
    await onlineActivityService.recordActiveSeconds(45, "UTC");

    await expect(db.dailyOnlineActivity.findMany()).resolves.toEqual([
      expect.objectContaining({ activeSeconds: 75 }),
    ]);
  });

  it("keeps direct callers within the same bounded report size as the API", async () => {
    await onlineActivityService.recordActiveSeconds(1_000, "UTC");

    await expect(db.dailyOnlineActivity.findMany()).resolves.toEqual([
      expect.objectContaining({ activeSeconds: 75 }),
    ]);
  });
});
