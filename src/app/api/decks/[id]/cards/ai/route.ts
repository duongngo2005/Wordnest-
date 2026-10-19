import { NextResponse } from "next/server";

/**
 * Compatibility endpoint for clients released before Local AI flashcard
 * generation was retired. It deliberately accepts no action and creates no
 * jobs, drafts, or Flashcard records.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "AI_FLASHCARD_GENERATION_RETIRED",
      error: "Tạo flashcard bằng AI Local đã được ngừng hỗ trợ. Hãy dùng External AI JSON Import.",
    },
    { status: 410 }
  );
}
