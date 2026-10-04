import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResourceNotFoundError } from "@/lib/http/errors";
import {
  practiceEvidenceService,
  MistakeFilter,
} from "@/services/vocabulary";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params;

    // Check deck existence
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { id: true, name: true },
    });

    if (!deck) {
      throw new ResourceNotFoundError("Bộ từ vựng không tồn tại.");
    }

    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");
    const filterParam = searchParams.get("filter");

    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 10;
    const filter = (filterParam ? filterParam.toUpperCase() : "ALL") as MistakeFilter;

    const validFilters: MistakeFilter[] = [
      "ALL",
      "NEEDS_PRACTICE",
      "RECENT_MISTAKES",
      "RESOLVED",
      "TYPED",
      "FILL_IN_BLANK",
      "MULTIPLE_CHOICE",
      "STORY_CLOZE",
      "STORY_CONTEXTUAL_VOCAB",
    ];

    const safeFilter: MistakeFilter = validFilters.includes(filter) ? filter : "ALL";

    const result = await practiceEvidenceService.getDeckMistakes(deckId, {
      page: isNaN(page) ? 1 : page,
      pageSize: isNaN(pageSize) ? 10 : pageSize,
      filter: safeFilter,
    });

    return NextResponse.json({
      success: true,
      data: {
        deck: {
          id: deck.id,
          name: deck.name,
        },
        ...result,
      },
    });
  } catch (error) {
    if (!(error instanceof ResourceNotFoundError)) {
      console.error("Error fetching deck mistakes:", error);
    }
    const message = error instanceof Error ? error.message : "Không thể tải danh sách lỗi sai.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: error instanceof ResourceNotFoundError ? 404 : 500 }
    );
  }
}
