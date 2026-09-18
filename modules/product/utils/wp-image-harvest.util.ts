import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';
import * as ExcelJS from 'exceljs';

/** Keep only Product IDs in `keepIds` (sheet ID → image URLs). */
export const filterImageUrlsByProductIds = (
  byProductId: Map<string, string[]>,
  keepIds: ReadonlySet<string>,
): Map<string, string[]> => {
  const filtered = new Map<string, string[]>();
  for (const [productId, urls] of byProductId) {
    if (!keepIds.has(productId)) continue;
    filtered.set(productId, urls);
  }
  return filtered;
};

export const collectUniqueImageUrls = (byProductId: Map<string, string[]>): string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const urls of byProductId.values()) {
    for (const raw of urls) {
      const url = raw.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      ordered.push(url);
    }
  }
  return ordered;
};

/** Keep gallery order; skip URLs that were not harvested; drop duplicate GCS keys. */
export const mapProductUrlsToGcsKeys = (
  byProductId: Map<string, string[]>,
  urlToGcsKey: Map<string, string>,
): Map<string, string[]> => {
  const mapped = new Map<string, string[]>();
  for (const [productId, urls] of byProductId) {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const raw of urls) {
      const key = urlToGcsKey.get(raw.trim());
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    mapped.set(productId, keys);
  }
  return mapped;
};

export const loadHarvestCache = async (filePath: string): Promise<Map<string, string>> => {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const map = new Map<string, string>();
    for (const [url, key] of Object.entries(parsed)) {
      if (typeof key === 'string' && key.trim()) {
        map.set(url, key.trim());
      }
    }
    return map;
  } catch {
    return new Map();
  }
};

export const saveHarvestCache = async (
  filePath: string,
  urlToGcsKey: Map<string, string>,
): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  const payload: Record<string, string> = {};
  for (const [url, key] of urlToGcsKey) {
    payload[url] = key;
  }
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload)}\n`, 'utf8');
  await rename(tmpPath, filePath);
};

export const writeHarvestedMappingWorkbook = async (
  filePath: string,
  byProductId: Map<string, string[]>,
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('images');
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 16 },
    { header: 'Images', key: 'images', width: 120 },
  ];

  const ids = [...byProductId.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const id of ids) {
    const keys = byProductId.get(id) ?? [];
    worksheet.addRow({ id, images: keys.join(', ') });
  }

  await mkdir(dirname(filePath), { recursive: true });
  await workbook.xlsx.writeFile(filePath);
};

/** Product ID → GCS keys JSON for bulk-upload / ops (same content as the xlsx map). */
export const writeHarvestedMappingJson = async (
  filePath: string,
  byProductId: Map<string, string[]>,
): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  const payload: Record<string, string[]> = {};
  const ids = [...byProductId.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const id of ids) {
    payload[id] = byProductId.get(id) ?? [];
  }
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(tmpPath, filePath);
};
