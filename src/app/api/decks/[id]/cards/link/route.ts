import { NextResponse } from "next/server";
import { z } from "zod";
import { InvalidJsonBodyError, readJsonBody } from "@/lib/http/json";
import { ResourceNotFoundError } from "@/lib/http/errors";
import {
  AmbiguousVocabularyIdentityError,
  deckService,
} from "@/services/vocabulary/deck-service";

const linkExistingVocabularySchema = z.object({
  flashcardId: z.string().min(1),
}).strict();

/**
 * Explicit user-initiated source association for a canonical vocabulary card.
 * The service enforces idempotency and rejects unresolved historical identities.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params;
    const body = await readJsonBody(request);
    const validation = linkExistingVocabularySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || "Yêu cầu liên kết từ vựng không hợp lệ." },
        { status: 400 }
      );
    }

    const result = await deckService.linkExistingVocabularyToDeck(deckId, validation.data.flashcardId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof AmbiguousVocabularyIdentityError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Link existing vocabulary failed:", error);
    return NextResponse.json(
      { success: false, error: "Không thể liên kết hồ sơ từ vựng với bộ thẻ." },
      { status: 500 }
    );
  }
}
