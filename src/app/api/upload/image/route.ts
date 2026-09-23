import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const EXTENSION_MAP: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Vui lòng chọn một tập tin hình ảnh hợp lệ." },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Định dạng ảnh không được hỗ trợ. Vui lòng dùng PNG, JPEG hoặc WebP.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "Kích thước ảnh tối đa cho phép là 5MB." },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "cards");
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const ext = EXTENSION_MAP[file.type] || ".jpg";
    const uniqueId = crypto.randomUUID().slice(0, 8);
    const safeFilename = `card_${Date.now()}_${uniqueId}${ext}`;
    const destinationPath = path.join(uploadDir, safeFilename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(destinationPath, buffer);

    const imageUrl = `/uploads/cards/${safeFilename}`;

    return NextResponse.json({
      success: true,
      imageUrl,
    });
  } catch (error) {
    console.error("[UploadImageAPI] Error uploading image:", error);
    return NextResponse.json(
      { success: false, error: "Đã xảy ra lỗi khi tải ảnh lên máy chủ." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl || !imageUrl.startsWith("/uploads/cards/")) {
      return NextResponse.json({ success: true, message: "No local file to delete." });
    }

    const filename = path.basename(imageUrl);
    const filePath = path.join(process.cwd(), "public", "uploads", "cards", filename);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }

    return NextResponse.json({ success: true, message: "File removed successfully." });
  } catch (error) {
    console.error("[UploadImageAPI] Error deleting image file:", error);
    return NextResponse.json(
      { success: false, error: "Không thể xóa tập tin ảnh cũ." },
      { status: 500 }
    );
  }
}
