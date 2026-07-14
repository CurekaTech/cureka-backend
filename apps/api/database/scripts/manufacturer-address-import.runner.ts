/**
 * Imports manufacturer master rows from an XLSX worksheet.
 *
 * Expected columns:
 *   ID (Product ID) — unique key per manufacturer row
 *   Manufacture Address → manufacturers.name (plain text, no [id] suffix)
 *
 * Behaviour:
 *   - One manufacturer per Product ID (duplicate addresses are kept)
 *   - Unique code = EXT{Product ID} (name may repeat)
 *   - manufacturers.address is always null
 *   - Does NOT change product.manufacturer_id (products stay on test_manufacture)
 *   - test_manufacture is never overwritten by the sheet
 *
 * Usage:
 *   npm run manufacturer-address:import -- --file="docs/Manufacture details (1).xlsx"
 *   npm run manufacturer-address:import -- --file="docs/Manufacture details (1).xlsx" --apply
 */
import 'reflect-metadata';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { ManufacturerEntity } from '../../../../modules/master/entities/manufacturer.entity';
import { MasterStatus } from '../../../../modules/master/enums/master-status.enum';
import {
  toManufacturerImportCode,
  toStoredManufacturerName,
} from '../../../../modules/master/utils/manufacturer-stored-name.util';
import {
  ManufacturerSheetRow,
  TEST_MANUFACTURER_NAME,
  loadManufacturerCodeRefIdSets,
  reserveUniqueManufacturerRefId,
  normalizeExternalId,
  normalizeText,
  readManufacturerSheetRows,
} from './manufacturer-import.shared';

const DEFAULT_FILE = 'docs/Manufacture details (1).xlsx';
const DEFAULT_BATCH_SIZE = 500;
const UPDATED_BY = 'manufacturer-address-import';

interface CliOptions {
  file: string;
  sheet?: string;
  apply: boolean;
  batchSize: number;
  report?: string;
}

type RowStatus =
  | 'pending_create'
  | 'unchanged'
  | 'invalid'
  | 'conflict'
  | 'duplicate_row'
  | 'skipped_placeholder';

interface ReportRow extends ManufacturerSheetRow {
  status: RowStatus;
  manufacturerRefId?: string;
  storedName?: string;
  storedCode?: string;
  reason?: string;
}

interface ResolvedManufacturerCreate {
  uniqueKey: string;
  name: string;
  code: string;
  sourceRows: number[];
}

interface ManufacturerAddressImportOptions {
  file: string;
  sheet?: string;
  apply: boolean;
  batchSize?: number;
  report?: string;
}

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    file: DEFAULT_FILE,
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      console.log(`
Manufacturer sheet importer

Sheet Manufacture Address → manufacturers.name (plain address)
Product ID → unique manufacturers.code (EXT{id}) so duplicate addresses are kept

Options:
  --file <path>          XLSX file (default: ${DEFAULT_FILE})
  --sheet <name>         Worksheet name (default: first worksheet)
  --batch-size <number>  Creates per transaction (default: ${DEFAULT_BATCH_SIZE})
  --report <path>        JSON report output path
  --apply                Write changes (without this flag, dry-run only)

Notes:
  - One manufacturer per Product ID (duplicate addresses OK)
  - Name has no [Product ID] suffix
  - Product manufacturer assignments are NOT changed
  - ${TEST_MANUFACTURER_NAME} is preserved for product links
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
    } else if (arg.startsWith('--report=')) {
      options.report = arg.slice('--report='.length);
    } else if (arg === '--report' && next) {
      options.report = next;
      index += 1;
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error('--batch-size must be a positive integer.');
  }

  return options;
};

const buildReportPath = (options: ManufacturerAddressImportOptions): string => {
  if (options.report) {
    return isAbsolute(options.report) ? options.report : resolve(process.cwd(), options.report);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(process.cwd(), 'docs', `manufacturer-address-import-${timestamp}.json`);
};

const loadActiveManufacturersByCode = async (): Promise<Map<string, ManufacturerEntity>> => {
  const manufacturers = await AppDataSource.getRepository(ManufacturerEntity)
    .createQueryBuilder('manufacturer')
    .where('manufacturer.deletedAt IS NULL')
    .getMany();

  const byCode = new Map<string, ManufacturerEntity>();
  for (const manufacturer of manufacturers) {
    byCode.set(manufacturer.code.toLowerCase().trim(), manufacturer);
  }
  return byCode;
};

const writeReport = async (
  reportPath: string,
  options: ManufacturerAddressImportOptions,
  rows: ReportRow[],
  summary: Record<string, number>,
): Promise<void> => {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: options.apply ? 'apply' : 'dry-run',
        sourceFile: options.file,
        targetTable: 'manufacturers',
        mapping:
          'sheet.Manufacture Address → manufacturers.name; Product ID → manufacturers.code EXT{id}; address=null',
        productsUnchanged: true,
        summary: { totalRows: rows.length, ...summary },
        rows,
      },
      null,
      2,
    ),
    'utf8',
  );
};

const applyCreates = async (
  creates: ResolvedManufacturerCreate[],
  batchSize: number,
): Promise<number> => {
  let created = 0;
  const manufacturerRepo = AppDataSource.getRepository(ManufacturerEntity);
  const reserved = await loadManufacturerCodeRefIdSets(manufacturerRepo);

  for (let offset = 0; offset < creates.length; offset += batchSize) {
    const batch = creates.slice(offset, offset + batchSize);
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ManufacturerEntity);
      const entities = batch.map((item) => {
        if (reserved.codes.has(item.code)) {
          throw new Error(`Manufacturer code "${item.code}" is already reserved.`);
        }
        reserved.codes.add(item.code);
        return repo.create({
          name: item.name,
          address: null,
          code: item.code,
          refId: reserveUniqueManufacturerRefId(item.name, reserved.refIds),
          status: MasterStatus.ACTIVE,
          logo: null,
          description: null,
          contactPerson: null,
          email: null,
          mobileNumber: null,
          gstNumber: null,
          drugLicenseNumber: null,
          createdBy: UPDATED_BY,
        });
      });
      await repo.save(entities);
      created += entities.length;
    });
    console.log(
      `[manufacturer-address-import] Created ${Math.min(offset + batch.length, creates.length)}/${creates.length}`,
    );
  }

  return created;
};

export const runManufacturerAddressImport = async (
  input: ManufacturerAddressImportOptions,
): Promise<void> => {
  const options: Required<Pick<ManufacturerAddressImportOptions, 'batchSize'>> &
    ManufacturerAddressImportOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
    ...input,
  };

  options.file = isAbsolute(options.file) ? options.file : resolve(process.cwd(), options.file);
  const reportPath = buildReportPath(options);

  console.log(`[manufacturer-address-import] File: ${options.file}`);
  console.log(
    `[manufacturer-address-import] Mode: ${options.apply ? 'APPLY' : 'DRY RUN (no database changes)'}`,
  );
  console.log(
    '[manufacturer-address-import] Mapping: Address → name; Product ID → code EXT{id}',
  );
  console.log(
    '[manufacturer-address-import] Duplicate addresses: kept (one manufacturer per Product ID)',
  );
  console.log('[manufacturer-address-import] Products: assignments will NOT be changed');

  const sheetRows = await readManufacturerSheetRows(options.file, options.sheet);
  console.log(`[manufacturer-address-import] Non-empty sheet rows: ${sheetRows.length}`);

  const ownsDataSource = !AppDataSource.isInitialized;
  if (ownsDataSource) {
    await AppDataSource.initialize();
  }

  try {
    const manufacturersByCode = await loadActiveManufacturersByCode();
    const reportRows: ReportRow[] = [];
    const createsByKey = new Map<string, ResolvedManufacturerCreate>();

    for (const row of sheetRows) {
      const address = row.address.trim();
      const productId = normalizeExternalId(row.id) || `R${row.rowNumber}`;

      if (!address) {
        reportRows.push({
          ...row,
          status: 'invalid',
          reason: 'Manufacture Address is empty.',
        });
        continue;
      }

      if (normalizeText(address) === normalizeText(TEST_MANUFACTURER_NAME)) {
        reportRows.push({
          ...row,
          status: 'skipped_placeholder',
          reason: `${TEST_MANUFACTURER_NAME} is preserved for product assignments.`,
        });
        continue;
      }

      const storedName = toStoredManufacturerName(address);
      const storedCode = toManufacturerImportCode(productId);
      const uniqueKey = storedCode.toLowerCase();
      const existing = manufacturersByCode.get(uniqueKey);

      if (existing) {
        reportRows.push({
          ...row,
          status: 'unchanged',
          manufacturerRefId: existing.refId,
          storedName: existing.name,
          storedCode: existing.code,
        });
        continue;
      }

      const pending = createsByKey.get(uniqueKey);
      if (pending) {
        pending.sourceRows.push(row.rowNumber);
        reportRows.push({
          ...row,
          status: 'duplicate_row',
          storedName,
          storedCode,
          reason: 'Same Product ID already queued from an earlier sheet row.',
        });
        continue;
      }

      createsByKey.set(uniqueKey, {
        uniqueKey,
        name: storedName,
        code: storedCode,
        sourceRows: [row.rowNumber],
      });
      reportRows.push({
        ...row,
        status: 'pending_create',
        storedName,
        storedCode,
      });
    }

    const creates = [...createsByKey.values()];
    const created = options.apply
      ? await applyCreates(creates, options.batchSize ?? DEFAULT_BATCH_SIZE)
      : 0;

    const summary = reportRows.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      },
      { created },
    );

    await writeReport(reportPath, options, reportRows, summary);

    console.log('\n[manufacturer-address-import] Summary');
    console.log(`  Rows read                    : ${sheetRows.length}`);
    console.log(
      `  ${options.apply ? 'Created' : 'Would create'} manufacturers : ${options.apply ? created : creates.length}`,
    );
    console.log(`  Unchanged (already present)  : ${summary.unchanged ?? 0}`);
    console.log(`  Duplicate Product ID rows    : ${summary.duplicate_row ?? 0}`);
    console.log(
      `  Invalid / skipped             : ${(summary.invalid ?? 0) + (summary.skipped_placeholder ?? 0)}`,
    );
    console.log(`  Products reassigned          : 0 (unchanged)`);
    console.log(`  Report                       : ${reportPath}`);
  } finally {
    if (ownsDataSource && AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

async function runCli(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  await runManufacturerAddressImport(options);
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
