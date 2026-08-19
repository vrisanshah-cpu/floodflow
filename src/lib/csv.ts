import type { CongestionSegment } from "./types";

/** Minimal RFC4180-ish CSV line splitter — handles quoted fields with commas. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function parseCongestionCsv(text: string): CongestionSegment[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [headerLine, ...rows] = lines;
  const headers = splitCsvLine(headerLine).map((h) => h.trim());

  return rows.map((row) => {
    const values = splitCsvLine(row);
    const record: Record<string, string> = {};
    headers.forEach((h, i) => (record[h] = values[i] ?? ""));

    return {
      id: record.id,
      name: record.name,
      congestion_score: Number(record.congestion_score),
      notes: record.notes || undefined,
      coordinates: [
        [Number(record.lon1), Number(record.lat1)],
        [Number(record.lon2), Number(record.lat2)],
      ],
    };
  });
}
