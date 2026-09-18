import mammoth from "mammoth";

export type SupportedDocumentType = "pdf" | "docx" | "txt";

export interface ExtractedDocumentResult {
  filename: string;
  fileType: SupportedDocumentType;
  text: string;
  wordCount: number;
  characterCount: number;
}

/**
 * Detects supported document format by file extension and mime type.
 */
export function detectDocumentType(filename: string, mimeType?: string): SupportedDocumentType {
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith(".pdf") || mimeType === "application/pdf") {
    return "pdf";
  }
  if (
    lowerName.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (lowerName.endsWith(".txt") || mimeType === "text/plain") {
    return "txt";
  }

  throw new Error("Định dạng file không được hỗ trợ. WordNest hỗ trợ các file: .pdf, .docx, .txt.");
}

/**
 * Cleans and normalizes raw text extracted from documents.
 */
export function cleanDocumentText(rawText: string, maxLength = 25000): string {
  if (!rawText) return "";

  let cleaned = rawText
    // Normalize unicode
    .normalize("NFKC")
    // Replace non-breaking spaces and form feeds
    .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
    .replace(/[\f\r]/g, "\n")
    // Collapse 3 or more newlines to 2 newlines
    .replace(/\n{3,}/g, "\n\n")
    // Collapse multiple horizontal spaces/tabs to single space
    .replace(/[ \t]+/g, " ")
    // Trim leading/trailing whitespace on each line
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  // Truncate if exceeds maximum length to avoid token limits
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
    // Try to cut at the last sentence end
    const lastPeriod = cleaned.lastIndexOf(".");
    if (lastPeriod > maxLength - 500) {
      cleaned = cleaned.substring(0, lastPeriod + 1);
    }
  }

  return cleaned;
}

export class DocumentService {
  /**
   * Extracts plain text from a buffer based on file type.
   */
  async extractText(
    buffer: Buffer,
    filename: string,
    mimeType?: string
  ): Promise<ExtractedDocumentResult> {
    const fileType = detectDocumentType(filename, mimeType);
    let rawText = "";

    switch (fileType) {
      case "txt": {
        rawText = buffer.toString("utf-8");
        break;
      }
      case "docx": {
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value || "";
        break;
      }
      case "pdf": {
        // Dynamically import pdf-parse to avoid top-level issues
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfModule = require("pdf-parse");
        const PDFParseClass = pdfModule.PDFParse || pdfModule;
        const parser = new PDFParseClass({ data: buffer });
        const res = await parser.getText();
        rawText = res?.text || "";
        break;
      }
      default:
        throw new Error("Định dạng file không được hỗ trợ.");
    }

    const cleanedText = cleanDocumentText(rawText);

    if (!cleanedText || cleanedText.trim().length < 20) {
      throw new Error(
        "Tài liệu không có đủ nội dung văn bản tiếng Anh để trích xuất từ vựng."
      );
    }

    const words = cleanedText.trim().split(/\s+/).filter(Boolean);

    return {
      filename,
      fileType,
      text: cleanedText,
      wordCount: words.length,
      characterCount: cleanedText.length,
    };
  }
}

export const documentService = new DocumentService();
