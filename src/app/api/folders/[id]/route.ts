import { NextResponse } from "next/server";
import { ResourceConflictError, ResourceNotFoundError } from "@/lib/http/errors";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { updateFolderSchema } from "@/lib/validation/folder";
import { folderService } from "@/services/vocabulary";
import { StaleDeletionPreviewError } from "@/services/vocabulary/deletion-preview";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (new URL(request.url).searchParams.get("impact") === "delete") {
      const impact = await folderService.getFolderDeletionImpact(id);
      return NextResponse.json({ success: true, impact });
    }
    const folder = await folderService.getFolder(id);
    if (!folder) {
      return NextResponse.json({ success: false, error: "Không tìm thấy learning collection." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: folder });
  } catch (error) {
    console.error("Error loading learning collection:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải learning collection." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = updateFolderSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu collection không hợp lệ." },
        { status: 400 }
      );
    }

    const folder = await folderService.updateFolder(id, validation.data);
    return NextResponse.json({ success: true, folder });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof ResourceConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error updating learning collection:", error);
    return NextResponse.json(
      { success: false, error: "Không thể cập nhật learning collection." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const previewFingerprint = request.headers.get("x-wordnest-deletion-preview");
    if (!previewFingerprint) {
      return NextResponse.json(
        { success: false, error: "Hãy xem trước ảnh hưởng hiện tại trước khi xác nhận xóa bộ sưu tập." },
        { status: 400 }
      );
    }
    await folderService.deleteFolder(id, previewFingerprint);
    return NextResponse.json({
      success: true,
      message: "Đã xóa collection. Các bộ thẻ vẫn được giữ trong mục Chưa phân loại.",
    });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof StaleDeletionPreviewError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error deleting learning collection:", error);
    return NextResponse.json(
      { success: false, error: "Không thể xóa learning collection." },
      { status: 500 }
    );
  }
}
