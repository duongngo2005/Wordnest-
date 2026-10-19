import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ResourceNotFoundError } from "@/lib/http/errors";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { externalAiV3ImportReviewSchema, externalAiV3ManifestSchema } from "@/lib/flashcards/json-import";
import { EXTERNAL_AI_V3_PROMPT_TERM_LIMIT } from "@/lib/flashcards/json-import-prompt";
import { deckService, JsonFlashcardImportError, StaleJsonFlashcardImportPreviewError } from "@/services/vocabulary";

const jsonImportRequestSchema = z.object({
  action: z.enum(["preview", "import"]),
  rawJson: z.string().max(1_000_000, "JSON vượt quá giới hạn 1 MB."),
  mode: z.enum(["legacy", "external-ai-v3"]).optional().default("legacy"),
  manifest: externalAiV3ManifestSchema.optional(),
  review: externalAiV3ImportReviewSchema.optional(),
  linkExistingCardIds: z.array(z.string().min(1)).max(EXTERNAL_AI_V3_PROMPT_TERM_LIMIT).optional().default([]),
}).superRefine((value, context) => {
  if (value.mode === "external-ai-v3" && !value.manifest) {
    context.addIssue({
      code: "custom",
      path: ["manifest"],
      message: "External AI V3 cần danh sách term gốc để kiểm tra kết quả.",
    });
  }
  if (value.action === "import" && value.mode === "external-ai-v3" && !value.review) {
    context.addIssue({
      code: "custom",
      path: ["review"],
      message: "External AI V3 cần Preview mới nhất trước khi xác nhận import.",
    });
  }
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
      const data = await deckService.previewJsonFlashcardImport(id, validation.data.rawJson, {
        mode: validation.data.mode,
        manifest: validation.data.manifest,
      });
      return NextResponse.json({ success: true, data });
    }

    const data = await deckService.importJsonFlashcards(id, validation.data.rawJson, {
      mode: validation.data.mode,
      manifest: validation.data.manifest,
      linkExistingCardIds: validation.data.linkExistingCardIds,
      review: validation.data.review,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof JsonFlashcardImportError) {
      return NextResponse.json({ success: false, error: error.message, details: error.errors }, { status: 400 });
    }
    if (error instanceof StaleJsonFlashcardImportPreviewError) {
      return NextResponse.json({ success: false, error: error.message, code: "STALE_PREVIEW" }, { status: 409 });
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
