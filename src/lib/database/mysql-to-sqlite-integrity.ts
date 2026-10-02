import { createHash } from "node:crypto";

type SnapshotRow = Record<string, unknown>;

export function createTableDigest(rows: SnapshotRow[]): string {
  const canonicalRows = rows
    .map((row) => canonicalizeValue(row))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return createHash("sha256").update(JSON.stringify(canonicalRows)).digest("hex");
}

export function assertMatchingTableDigests(tableName: string, sourceDigest: string, destinationDigest: string): void {
  if (sourceDigest !== destinationDigest) {
    throw new Error(`Integrity verification failed for ${tableName}: source and SQLite data differ.`);
  }
}

export function parseMySqlDateTime(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error(`Invalid MySQL datetime: ${value}`);

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionalText = ""] = match;
  if (fractionalText.slice(3).replaceAll("0", "")) {
    throw new Error(`MySQL datetime has precision SQLite cannot preserve: ${value}`);
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(`${fractionalText}000`.slice(0, 3));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new Error(`Invalid MySQL datetime: ${value}`);
  }

  return date;
}

function canonicalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as SnapshotRow)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalizeValue(nestedValue)])
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Snapshots cannot contain non-finite numbers.");
  }
  return value;
}
