import { describe, it, expect } from "vitest";
import {
  detectDocumentType,
  cleanDocumentText,
  DocumentService,
} from "./document-service";

describe("detectDocumentType", () => {
  it("detects PDF files by extension", () => {
    expect(detectDocumentType("research_paper.pdf")).toBe("pdf");
    expect(detectDocumentType("ARTICLE.PDF")).toBe("pdf");
  });

  it("detects DOCX files by extension", () => {
    expect(detectDocumentType("vocabulary_lesson.docx")).toBe("docx");
    expect(detectDocumentType("NOTES.DOCX")).toBe("docx");
  });

  it("detects TXT files by extension", () => {
    expect(detectDocumentType("notes.txt")).toBe("txt");
    expect(detectDocumentType("SAMPLE.TXT")).toBe("txt");
  });

  it("detects by mimeType when extension is missing", () => {
    expect(detectDocumentType("unknown_file", "application/pdf")).toBe("pdf");
    expect(detectDocumentType("file", "text/plain")).toBe("txt");
  });

  it("throws for unsupported file extensions", () => {
    expect(() => detectDocumentType("image.png")).toThrow(
      "Định dạng file không được hỗ trợ"
    );
    expect(() => detectDocumentType("archive.zip")).toThrow();
  });
});

describe("cleanDocumentText", () => {
  it("normalizes multiple blank lines and whitespace", () => {
    const raw = "Paragraph one.   \n\n\n\n   Paragraph two with    tabs\tand spaces.";
    const cleaned = cleanDocumentText(raw);
    expect(cleaned).toContain("Paragraph one.");
    expect(cleaned).toContain("Paragraph two with tabs and spaces.");
    expect(cleaned).not.toContain("\n\n\n");
  });

  it("strips form feeds and control spaces", () => {
    const raw = "Page 1\fPage 2\r\nSome\u00A0non-breaking text.";
    const cleaned = cleanDocumentText(raw);
    expect(cleaned).toContain("Some non-breaking text.");
    expect(cleaned).not.toContain("\f");
  });

  it("handles empty or null text gracefully", () => {
    expect(cleanDocumentText("")).toBe("");
  });

  it("truncates very long text safely", () => {
    const longText = "Word. ".repeat(6000);
    const cleaned = cleanDocumentText(longText, 1000);
    expect(cleaned.length).toBeLessThanOrEqual(1005);
  });
});

describe("DocumentService.extractText", () => {
  const service = new DocumentService();

  it("extracts text from plain text buffer", async () => {
    const sample = "Sustainable development requires innovation and perseverance across all communities.";
    const buf = Buffer.from(sample, "utf-8");

    const result = await service.extractText(buf, "sample.txt");
    expect(result.filename).toBe("sample.txt");
    expect(result.fileType).toBe("txt");
    expect(result.text).toBe(sample);
    expect(result.wordCount).toBe(9);
  });

  it("throws error for empty or too short text", async () => {
    const buf = Buffer.from("Too short", "utf-8");
    await expect(service.extractText(buf, "short.txt")).rejects.toThrow(
      "không có đủ nội dung văn bản"
    );
  });
});
