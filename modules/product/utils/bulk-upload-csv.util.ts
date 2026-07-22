export const escapeCsvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (!/[",\r\n]/.test(raw)) {
    return raw;
  }
  return `"${raw.replace(/"/g, '""')}"`;
};

export const formatCsvRow = (cells: Array<string | number | null | undefined>): string =>
  cells.map((cell) => escapeCsvCell(cell)).join(',');

export const CSV_UTF8_BOM = '\uFEFF';

/**
 * Minimal RFC-style CSV line parser (handles quoted fields).
 */
export const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
};
