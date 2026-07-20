/**
 * Imports brand master rows from an XLSX worksheet.
 *
 * Expected column:
 *   Brand* (or Brand / Brands)
 *
 * Behaviour:
 *   - `|` splits one cell into multiple brands
 *   - Duplicate names (case/spacing insensitive) collapse to one brand
 *   - Existing DB brands matched by normalized name are left unchanged
 *   - Missing brands are created as ACTIVE
 *
 * Usage:
 *   npm run brand:import -- --file="docs/Brands.xlsx"
 *   npm run brand:apply
 */
import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { isAbsolute, resolve } from 'path';
import { generateUniqueRefId } from '@packages/common';
import { generateSlug } from '@packages/common/pagination.util';
import { AppDataSource } from '../data-source';
import { BrandEntity } from '../../../../modules/master/entities/brand.entity';
import { MasterStatus } from '../../../../modules/master/enums/master-status.enum';

const DEFAULT_FILE = 'docs/Brands.xlsx';
const DEFAULT_BATCH_SIZE = 200;
const CREATED_BY = 'brand-import';

interface CliOptions {
  file: string;
  sheet?: string;
  apply: boolean;
  batchSize: number;
}

type BrandStatus = 'pending_create' | 'unchanged' | 'created' | 'invalid' | 'duplicate_sheet';

interface BrandCandidate {
  name: string;
  normalizedName: string;
  slug: string;
  sourceRows: number[];
  status: BrandStatus;
  brandRefId?: string;
  reason?: string;
}

const normalizeBrandName = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

const buildBrandSlug = (name: string): string => {
  const slug = generateSlug(name.trim())
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'brand';
};

const cellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? '').join('').trim();
  }
  if ('result' in value && value.result !== undefined && value.result !== null) {
    return String(value.result).trim();
  }
  if ('text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  return String(cell.text ?? '').trim();
};

const normalizeHeader = (value: string): string =>
  value.toLowerCase().replace(/[*_]+/g, ' ').replace(/\s+/g, ' ').trim();

const absolutePath = (path: string): string =>
  isAbsolute(path) ? path : resolve(process.cwd(), path);

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_FILE,
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      console.log(`
Brand sheet importer

Options:
  --file <path>          XLSX file (default: ${DEFAULT_FILE})
  --sheet <name>         Worksheet name (default: first worksheet)
  --batch-size <number>  Creates per transaction (default: ${DEFAULT_BATCH_SIZE})
  --apply                Write changes (without this flag, dry-run only)

Rules:
  - Split Brand cells on "|"
  - Same brand name (ignoring case/spacing) is stored once
  - Existing brands are not duplicated
`);
      process.exit(0);
    }

    if (arg === '--apply') {
      options.apply = true;
    } else if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
    } else if (arg === '--file' && next) {
      options.file = next;
      index += 1;
    } else if (arg.startsWith('--sheet=')) {
      options.sheet = arg.slice('--sheet='.length);
    } else if (arg === '--sheet' && next) {
      options.sheet = next;
      index += 1;
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = Number(arg.slice('--batch-size='.length));
    } else if (arg === '--batch-size' && next) {
      options.batchSize = Number(next);
      index += 1;
    }
  }

  return options;
};

const readBrandNamesFromSheet = async (
  filePath: string,
  sheetName?: string,
): Promise<Array<{ rowNumber: number; names: string[] }>> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = sheetName
    ? workbook.getWorksheet(sheetName) ?? workbook.worksheets[0]
    : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`No worksheet found in ${filePath}`);
  }

  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header) headers.set(header, columnNumber);
  });

  const brandColumn =
    headers.get('brand') ??
    headers.get('brands') ??
    headers.get('brand name') ??
    1;

  const rows: Array<{ rowNumber: number; names: string[] }> = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const raw = cellText(worksheet.getRow(rowNumber).getCell(brandColumn));
    if (!raw) continue;
    const names = raw
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    if (!names.length) continue;
    rows.push({ rowNumber, names });
  }

  return rows;
};

const reserveUniqueSlug = (baseSlug: string, usedSlugs: Set<string>): string => {
  let candidate = baseSlug;
  let suffix = 2;
  while (usedSlugs.has(candidate)) {
    candidate = `${baseSlug}-${suffix}`.slice(0, 300);
    suffix += 1;
  }
  usedSlugs.add(candidate);
  return candidate;
};

const run = async (options: CliOptions): Promise<void> => {
  const filePath = absolutePath(options.file);
  console.log(`[brand-import] File: ${filePath}`);
  console.log(`[brand-import] Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`);

  const sheetRows = await readBrandNamesFromSheet(filePath, options.sheet);
  console.log(`[brand-import] Non-empty sheet rows: ${sheetRows.length}`);

  const candidatesByKey = new Map<string, BrandCandidate>();
  let splitCount = 0;
  let invalidCount = 0;

  for (const row of sheetRows) {
    for (const name of row.names) {
      splitCount += 1;
      const normalizedName = normalizeBrandName(name);
      if (!normalizedName) {
        invalidCount += 1;
        continue;
      }

      const existing = candidatesByKey.get(normalizedName);
      if (existing) {
        existing.sourceRows.push(row.rowNumber);
        continue;
      }

      candidatesByKey.set(normalizedName, {
        name: name.trim(),
        normalizedName,
        slug: buildBrandSlug(name),
        sourceRows: [row.rowNumber],
        status: 'pending_create',
      });
    }
  }

  await AppDataSource.initialize();
  try {
    const brandRepo = AppDataSource.getRepository(BrandEntity);
    const existingBrands = await brandRepo
      .createQueryBuilder('brand')
      .where('brand.deletedAt IS NULL')
      .getMany();

    const existingByNormalizedName = new Map(
      existingBrands.map((brand) => [normalizeBrandName(brand.name), brand]),
    );
    const usedSlugs = new Set(existingBrands.map((brand) => brand.slug));
    const usedRefIds = new Set(
      (
        await brandRepo
          .createQueryBuilder('brand')
          .select(['brand.refId'])
          .withDeleted()
          .getMany()
      ).map((brand) => brand.refId),
    );

    const creates: BrandCandidate[] = [];
    for (const candidate of candidatesByKey.values()) {
      const existing = existingByNormalizedName.get(candidate.normalizedName);
      if (existing) {
        candidate.status = 'unchanged';
        candidate.brandRefId = existing.refId;
        candidate.reason = 'Brand already exists in database.';
        continue;
      }

      candidate.slug = reserveUniqueSlug(candidate.slug, usedSlugs);
      candidate.status = 'pending_create';
      creates.push(candidate);
    }

    let created = 0;
    if (options.apply && creates.length) {
      for (let offset = 0; offset < creates.length; offset += options.batchSize) {
        const batch = creates.slice(offset, offset + options.batchSize);
        await AppDataSource.transaction(async (manager) => {
          const repo = manager.getRepository(BrandEntity);
          for (const candidate of batch) {
            const refId = await generateUniqueRefId(candidate.name, async (value) =>
              usedRefIds.has(value),
            );
            usedRefIds.add(refId);
            const saved = await repo.save(
              repo.create({
                name: candidate.name,
                slug: candidate.slug,
                logo: null,
                banner: null,
                description: null,
                status: MasterStatus.ACTIVE,
                inHomePage: false,
                metaTitle: null,
                metaDescription: null,
                metaKeywords: null,
                refId,
                createdBy: CREATED_BY,
              }),
            );
            candidate.status = 'created';
            candidate.brandRefId = saved.refId;
            candidate.reason = 'Created from Brands.xlsx.';
            created += 1;
          }
        });
        console.log(`[brand-import] Created ${Math.min(offset + batch.length, creates.length)}/${creates.length}`);
      }
    }

    const unchanged = [...candidatesByKey.values()].filter((item) => item.status === 'unchanged').length;
    console.log('\n[brand-import] Summary');
    console.log(`  Sheet values after "|" split : ${splitCount}`);
    console.log(`  Unique brand names           : ${candidatesByKey.size}`);
    console.log(`  Already in database          : ${unchanged}`);
    console.log(
      `  ${options.apply ? 'Created' : 'Would create'}                     : ${options.apply ? created : creates.length}`,
    );
    console.log(`  Invalid                       : ${invalidCount}`);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

if (require.main === module) {
  run(parseCli(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
