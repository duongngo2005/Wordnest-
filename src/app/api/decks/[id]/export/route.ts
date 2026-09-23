import { NextResponse } from "next/server";
import { csvService } from "@/services/csv";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { filename, csvContent } = await csvService.exportDeckToCsv(id);

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("CSV export failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể xuất file CSV.",
      },
      { status: 500 }
    );
  }
}
