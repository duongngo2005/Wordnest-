import { NextResponse } from "next/server";
import { documentService } from "@/services/document/document-service";
import { aiService } from "@/services/ai";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawPastedText = formData.get("text") as string | null;

    let textToAnalyze = "";
    let filename = "Văn bản dán trực tiếp";
    let fileType = "txt";
    let wordCount = 0;
    let characterCount = 0;

    if (file && file.size > 0) {
      filename = file.name;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const extracted = await documentService.extractText(
        buffer,
        file.name,
        file.type
      );

      textToAnalyze = extracted.text;
      fileType = extracted.fileType;
      wordCount = extracted.wordCount;
      characterCount = extracted.characterCount;
    } else if (rawPastedText && rawPastedText.trim().length > 0) {
      textToAnalyze = rawPastedText.trim();
      const words = textToAnalyze.split(/\s+/).filter(Boolean);
      wordCount = words.length;
      characterCount = textToAnalyze.length;

      if (characterCount < 20) {
        return NextResponse.json(
          {
            success: false,
            error: "Văn bản quá ngắn. Vui lòng nhập hoặc tải lên đoạn văn có ít nhất 20 ký tự.",
          },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Vui lòng chọn một file tài liệu (PDF, DOCX, TXT) hoặc nhập văn bản tiếng Anh.",
        },
        { status: 400 }
      );
    }

    // Call AI to extract high-value vocabulary items
    const items = await aiService.extractVocabularyFromText(textToAnalyze, {
      maxTerms: 50,
    });

    if (!items || items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Không trích xuất được từ vựng tiếng Anh phù hợp từ tài liệu này.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      filename,
      fileType,
      wordCount,
      characterCount,
      items,
    });
  } catch (error) {
    console.error("Error extracting vocabulary from document:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Đã có lỗi xảy ra trong quá trình xử lý tài liệu.";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
