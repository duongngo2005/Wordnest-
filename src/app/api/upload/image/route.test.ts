import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, DELETE } from "./route";
import fs from "fs";

describe("POST /api/upload/image", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when no file is uploaded", async () => {
    const formData = new FormData();
    const request = new Request("http://localhost:3000/api/upload/image", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Vui lòng chọn");
  });

  it("rejects unsupported MIME types like text/plain", async () => {
    const formData = new FormData();
    const fakeFile = new File(["hello world"], "test.txt", { type: "text/plain" });
    formData.append("file", fakeFile);

    const request = new Request("http://localhost:3000/api/upload/image", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Định dạng ảnh không được hỗ trợ");
  });

  it("rejects files exceeding the 5MB size limit", async () => {
    const formData = new FormData();
    // Create a mock file with size > 5MB
    const bigBuffer = new Uint8Array(5 * 1024 * 1024 + 10);
    const bigFile = new File([bigBuffer], "large_image.jpg", { type: "image/jpeg" });
    formData.append("file", bigFile);

    const request = new Request("http://localhost:3000/api/upload/image", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Kích thước ảnh tối đa cho phép là 5MB");
  });

  it("accepts valid image/png and saves file safely", async () => {
    vi.spyOn(fs.promises, "mkdir").mockResolvedValueOnce(undefined as never);
    vi.spyOn(fs.promises, "writeFile").mockResolvedValueOnce(undefined as never);

    const formData = new FormData();
    const fakeImage = new File([new Uint8Array([137, 80, 78, 71])], "avatar.png", {
      type: "image/png",
    });
    formData.append("file", fakeImage);

    const request = new Request("http://localhost:3000/api/upload/image", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.imageUrl).toMatch(/^\/uploads\/cards\/card_\d+_[a-z0-9]+\.png$/);
  });
});

describe("DELETE /api/upload/image", () => {
  it("ignores non-local URLs safely", async () => {
    const request = new Request(
      "http://localhost:3000/api/upload/image?url=https://images.unsplash.com/photo",
      { method: "DELETE" }
    );
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("unlinks local file if present", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValueOnce(true);
    const unlinkSpy = vi.spyOn(fs.promises, "unlink").mockResolvedValueOnce(undefined as never);

    const request = new Request(
      "http://localhost:3000/api/upload/image?url=/uploads/cards/card_123_abc.png",
      { method: "DELETE" }
    );
    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(unlinkSpy).toHaveBeenCalled();
  });
});
