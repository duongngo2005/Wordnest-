import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { deckService, JsonFlashcardImportError } from "@/services/vocabulary";

const jsonImportRequestSchema = z.object({
  action: z.enum(["preview", "import"]),
  rawJson: z.string().max(1_000_000, "JSON vượt quá giới hạn 1 MB."),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const validation = jsonImportRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Yêu cầu JSON Import không hợp lệ." },
        { status: 400 }
      );
    }

    if (validation.data.action === "preview") {
      const data = await deckService.previewJsonFlashcardImport(id, validation.data.rawJson);
      return NextResponse.json({ success: true, data });
    }

    const data = await deckService.importJsonFlashcards(id, validation.data.rawJson);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof JsonFlashcardImportError) {
      return NextResponse.json({ success: false, error: error.message, details: error.errors }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Một từ trong JSON vừa được thêm vào bộ thẻ. Vui lòng Validate & Preview lại trước khi import." },
        { status: 409 }
      );
    }
    console.error("JSON flashcard import failed:", error);
    return NextResponse.json(
      { success: false, error: "Không thể nhập flashcard từ JSON." },
      { status: 500 }
    );
  }
}
