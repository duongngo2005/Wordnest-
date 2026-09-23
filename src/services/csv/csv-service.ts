import { db } from "@/lib/db";

/** Escapes one field for the portable, UTF-8 CSV export format. */
export function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return text.includes('"') || text.includes(",") || text.includes(";") || text.includes("\n") || text.includes("\r")
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export class CsvService {
  async exportDeckToCsv(deckId: string): Promise<{ filename: string; csvContent: string }> {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      include: { cards: { orderBy: { createdAt: "asc" } } },
    });

    if (!deck) throw new Error(`Bộ thẻ với ID ${deckId} không tồn tại.`);

    const headers = ["term", "definition", "translation", "ipa", "partOfSpeech", "cefr", "example", "exampleVi"];
    const rows = deck.cards.map((card) => [
      escapeCsvField(card.term),
      escapeCsvField(card.definitionEn),
      escapeCsvField(card.meaningVi),
      escapeCsvField(card.ipa),
      escapeCsvField(card.partOfSpeech),
      escapeCsvField(card.cefr),
      escapeCsvField(card.exampleEn),
      escapeCsvField(card.exampleVi),
    ].join(","));
    const safeDeckName = deck.name.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, "_").substring(0, 40);

    return {
      filename: `${safeDeckName}_export.csv`,
      csvContent: `\uFEFF${[headers.join(","), ...rows].join("\r\n")}`,
    };
  }
}

export const csvService = new CsvService();
