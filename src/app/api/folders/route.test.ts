import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";

const TEST_PREFIX = "Folder API test";

afterEach(async () => {
  await db.folder.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
});

describe("Folder API", () => {
  it("validates input and creates a learning collection", async () => {
    const invalid = await POST(
      new Request("http://localhost/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "" }),
      })
    );
    expect(invalid.status).toBe(400);

    const created = await POST(
      new Request("http://localhost/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `${TEST_PREFIX} TOEIC`, color: "blue" }),
      })
    );
    const createdData = await created.json();

    expect(created.status).toBe(201);
    expect(createdData.folder).toMatchObject({ name: `${TEST_PREFIX} TOEIC`, color: "blue" });

    const listed = await GET();
    const listedData = await listed.json();
    expect(listedData.data.folders).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: createdData.folder.id })])
    );
  });

  it("deletes only the folder through the safe API", async () => {
    const folder = await db.folder.create({
      data: {
        name: `${TEST_PREFIX} Safe delete`,
        normalizedName: `${TEST_PREFIX} Safe delete`.toLowerCase(),
      },
    });
    const deck = await db.deck.create({
      data: { name: `${TEST_PREFIX} retained deck`, folderId: folder.id },
    });

    const response = await DELETE(new Request(`http://localhost/api/folders/${folder.id}`), {
      params: Promise.resolve({ id: folder.id }),
    });

    expect(response.status).toBe(200);
    await expect(db.deck.findUniqueOrThrow({ where: { id: deck.id } })).resolves.toMatchObject({
      folderId: null,
    });
    await db.deck.delete({ where: { id: deck.id } });
  });
});
