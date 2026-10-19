import { createHash } from "node:crypto";

/**
 * An impact preview is valid only for the data it described. The fingerprint
 * is not an authorization token; the server recomputes it inside the same
 * transaction that performs the organizational deletion.
 */
export function createDeletionPreviewFingerprint(snapshot: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("base64url");
}

export class StaleDeletionPreviewError extends Error {
  constructor() {
    super("Dữ liệu đã thay đổi sau khi xem trước. WordNest đã không xóa gì; hãy xem lại ảnh hưởng rồi xác nhận lại.");
    this.name = "StaleDeletionPreviewError";
  }
}

export function assertDeletionPreviewIsCurrent(
  expectedFingerprint: string | undefined,
  currentFingerprint: string
) {
  if (expectedFingerprint !== undefined && expectedFingerprint !== currentFingerprint) {
    throw new StaleDeletionPreviewError();
  }
}
