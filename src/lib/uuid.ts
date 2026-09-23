/**
 * Universal RFC 4122 v4 UUID generator.
 * Works seamlessly in Node.js, Web Workers, Secure Contexts (HTTPS / localhost),
 * and Insecure Contexts (HTTP on private LAN IPs).
 */
export function generateUUID(): string {
  // 1. Native crypto.randomUUID (available in Node.js and browser Secure Contexts)
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through if restricted
    }
  }

  // 2. crypto.getRandomValues (available in browser Insecure Contexts, e.g. Chrome on HTTP LAN)
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 v4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // Fall through to Math.random
    }
  }

  // 3. Fallback using Math.random formatted as valid RFC 4122 v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
