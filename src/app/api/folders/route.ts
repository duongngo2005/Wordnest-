import { NextResponse } from "next/server";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceConflictError } from "@/lib/http/errors";
import { createFolderSchema } from "@/lib/validation/folder";
import { folderService } from "@/services/vocabulary";

export async function GET() {
  try {
    const library = await folderService.getLibrary();
    return NextResponse.json({ success: true, data: library });
  } catch (error) {
    console.error("Error loading learning collections:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tải thư viện học tập." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const validation = createFolderSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Dữ liệu collection không hợp lệ." },
        { status: 400 }
      );
    }

    const folder = await folderService.createFolder(validation.data);
    return NextResponse.json({ success: true, folder }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error creating learning collection:", error);
    return NextResponse.json(
      { success: false, error: "Không thể tạo learning collection." },
      { status: 500 }
    );
  }
}
