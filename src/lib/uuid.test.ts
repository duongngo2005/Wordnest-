import { describe, it, expect, vi } from "vitest";
import { generateUUID } from "./uuid";
import { z } from "zod";

describe("generateUUID", () => {
  const uuidSchema = z.string().uuid();

  it("generates a valid RFC 4122 v4 UUID in normal environment", () => {
    const id = generateUUID();
    expect(uuidSchema.safeParse(id).success).toBe(true);
  });

  it("generates unique UUIDs across multiple calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUUID()));
    expect(ids.size).toBe(100);
  });

  it("generates valid UUID when crypto.randomUUID is unavailable (e.g. insecure HTTP LAN context)", () => {
    const originalCrypto = globalThis.crypto;

    // Simulate insecure origin where randomUUID is undefined but getRandomValues is present
    const mockCrypto = {
      getRandomValues: (arr: Uint8Array) => originalCrypto.getRandomValues(arr),
    } as Crypto;

    vi.stubGlobal("crypto", mockCrypto);

    try {
      const id = generateUUID();
      expect(uuidSchema.safeParse(id).success).toBe(true);
    } finally {
      vi.stubGlobal("crypto", originalCrypto);
    }
  });

  it("generates valid UUID when entire crypto object is missing (pure Math.random fallback)", () => {
    const originalCrypto = globalThis.crypto;

    vi.stubGlobal("crypto", undefined);

    try {
      const id = generateUUID();
      expect(uuidSchema.safeParse(id).success).toBe(true);
    } finally {
      vi.stubGlobal("crypto", originalCrypto);
    }
  });
});
