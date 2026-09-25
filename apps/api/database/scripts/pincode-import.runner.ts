/**
 * Imports India Post pincode offices from docs/json/india_pincode_data.json.
 *
 * The file is a JSON array but is not strict JSON: some coordinates are literal NaN.
 * Those values are stored as null. Re-running upserts offices by source hash and
 * refreshes the canonical pincode row (one per 6-digit code). Variant mappings are
 * left untouched.
 *
 * Usage:
 *   npm run import:pincodes
 *   npm run import:pincodes -- --file="docs/json/india_pincode_data.json"
 */
import 'reflect-metadata';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';

const DEFAULT_FILE = 'docs/json/india_pincode_data.json';
const BATCH_SIZE = 400;

interface OfficeRow {
  pincode: string;
  circleName: string;
  regionName: string;
  divisionName: string;
  officeName: string;
  officeType: string;
  delivery: string;
  district: string;
  stateName: string;
  latitude: string | null;
  longitude: string | null;
  sourceHash: string;
}

function absolutePath(file: string): string {
  return isAbsolute(file) ? file : resolve(process.cwd(), file);
}

function readFileArg(): string {
  const flag = process.argv.find((arg) => arg.startsWith('--file='));
  return absolutePath(flag ? flag.slice('--file='.length) : DEFAULT_FILE);
}

function text(value: unknown, max: number): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  return raw.length > max ? raw.slice(0, max) : raw;
}

function coordinate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(7);
}

function padPincode(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const padded = digits.padStart(6, '0');
  return /^\d{6}$/.test(padded) ? padded : null;
}

function sourceHash(row: Omit<OfficeRow, 'sourceHash'>): string {
  const payload = [
    row.pincode,
    row.circleName,
    row.regionName,
    row.divisionName,
    row.officeName,
    row.officeType,
    row.delivery,
    row.district,
    row.stateName,
    row.latitude ?? '',
    row.longitude ?? '',
  ].join('\u001f');
  return createHash('sha1').update(payload).digest('hex');
}

function toOffice(raw: Record<string, unknown>): OfficeRow | null {
  const pincode = padPincode(raw.pincode);
  if (!pincode) return null;
  const row = {
    pincode,
    circleName: text(raw.circlename, 255),
    regionName: text(raw.regionname, 255),
    divisionName: text(raw.divisionname, 255),
    officeName: text(raw.officename, 255),
    officeType: text(raw.officetype, 50),
    delivery: text(raw.delivery, 100),
    district: text(raw.district, 255),
    stateName: text(raw.statename, 255),
    latitude: coordinate(raw.latitude),
    longitude: coordinate(raw.longitude),
  };
  return { ...row, sourceHash: sourceHash(row) };
}

async function streamOffices(file: string, onBatch: (rows: OfficeRow[]) => Promise<void>): Promise<number> {
  const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let buffer = '';
  let seen = 0;
  let batch: OfficeRow[] = [];
  const objectPattern = /\{[^{}]*\}/g;

  const consume = async (chunk: string, flush: boolean): Promise<void> => {
    buffer += chunk;
    objectPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = objectPattern.exec(buffer))) {
      lastIndex = match.index + match[0].length;
      const json = match[0].replace(/:\s*NaN/g, ': null');
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(json) as Record<string, unknown>;
      } catch {
        continue;
      }
      const office = toOffice(parsed);
      if (!office) continue;
      seen += 1;
      batch.push(office);
      if (batch.length >= BATCH_SIZE) {
        const ready = batch;
        batch = [];
        await onBatch(ready);
      }
    }
    buffer = buffer.slice(lastIndex);
    if (flush && batch.length) {
      await onBatch(batch);
      batch = [];
    }
  };

  for await (const chunk of stream) {
    await consume(chunk, false);
  }
  await consume('', true);
  return seen;
}

async function upsertBatch(rows: OfficeRow[]): Promise<void> {
  const uniqueByHash = new Map<string, OfficeRow>();
  for (const row of rows) uniqueByHash.set(row.sourceHash, row);
  const offices = [...uniqueByHash.values()];
  const pincodes = [...new Set(offices.map((row) => row.pincode))];

  const pincodePlaceholders = pincodes.map((_, index) => `($${index + 1})`).join(', ');
  await AppDataSource.query(
    `
    INSERT INTO pincodes (pincode)
    VALUES ${pincodePlaceholders}
    ON CONFLICT (pincode) DO NOTHING
    `,
    pincodes,
  );

  const values: unknown[] = [];
  const tuples = offices.map((row, index) => {
    const base = index * 12;
    values.push(
      row.pincode,
      row.circleName,
      row.regionName,
      row.divisionName,
      row.officeName,
      row.officeType,
      row.delivery,
      row.district,
      row.stateName,
      row.latitude,
      row.longitude,
      row.sourceHash,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}::numeric, $${base + 11}::numeric, $${base + 12})`;
  });

  await AppDataSource.query(
    `
    INSERT INTO pincode_offices (
      pincode_id, pincode, circlename, regionname, divisionname, officename,
      officetype, delivery, district, statename, latitude, longitude, source_hash
    )
    SELECT p.id, v.pincode, v.circlename, v.regionname, v.divisionname, v.officename,
           v.officetype, v.delivery, v.district, v.statename, v.latitude, v.longitude, v.source_hash
    FROM (
      VALUES ${tuples.join(', ')}
    ) AS v(
      pincode, circlename, regionname, divisionname, officename,
      officetype, delivery, district, statename, latitude, longitude, source_hash
    )
    INNER JOIN pincodes p ON p.pincode = v.pincode
    ON CONFLICT (source_hash) DO UPDATE SET
      pincode_id = EXCLUDED.pincode_id,
      pincode = EXCLUDED.pincode,
      circlename = EXCLUDED.circlename,
      regionname = EXCLUDED.regionname,
      divisionname = EXCLUDED.divisionname,
      officename = EXCLUDED.officename,
      officetype = EXCLUDED.officetype,
      delivery = EXCLUDED.delivery,
      district = EXCLUDED.district,
      statename = EXCLUDED.statename,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      updated_at = NOW()
    `,
    values,
  );
}

async function refreshCanonicalPincodes(): Promise<void> {
  await AppDataSource.query(`
    UPDATE pincodes p
    SET district = ranked.district,
        statename = ranked.statename,
        updated_at = NOW()
    FROM (
      SELECT pincode, district, statename
      FROM (
        SELECT
          pincode,
          district,
          statename,
          ROW_NUMBER() OVER (
            PARTITION BY pincode
            ORDER BY COUNT(*) DESC, district ASC, statename ASC
          ) AS rn
        FROM pincode_offices
        GROUP BY pincode, district, statename
      ) counts
      WHERE rn = 1
    ) ranked
    WHERE ranked.pincode = p.pincode
  `);
}

async function main(): Promise<void> {
  const file = readFileArg();
  await AppDataSource.initialize();
  let written = 0;
  try {
    const seen = await streamOffices(file, async (rows) => {
      await upsertBatch(rows);
      written += rows.length;
      if (written % 4000 === 0) {
        console.log(`Imported ${written} office rows...`);
      }
    });
    await refreshCanonicalPincodes();
    const [{ offices, pincodes }] = await AppDataSource.query<
      Array<{ offices: string; pincodes: string }>
    >(`
      SELECT
        (SELECT COUNT(*) FROM pincode_offices) AS offices,
        (SELECT COUNT(*) FROM pincodes) AS pincodes
    `);
    console.log(
      `Pincode import complete. Read ${seen} offices from file. Database has ${offices} offices and ${pincodes} canonical pincodes.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
