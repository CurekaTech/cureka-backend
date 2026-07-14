/**
 * Imports manufacturer master rows from an XLSX worksheet.
 *
 * Expected columns:
 *   Manufacture Address (or Manufacturer Address / Address)
 *   ID (Product ID) — used to make manufacturers.name unique
 *
 * Behaviour:
 *   - One manufacturer per sheet row (duplicate addresses are kept)
 *   - Sheet "Manufacture Address" + " [Product ID]" → manufacturers.name
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
import { toStoredManufacturerName } from '../../../../modules/master/utils/manufacturer-stored-name.util';
import {
  ManufacturerSheetRow,
  TEST_MANUFACTURER_NAME,
  loadManufacturerCodeRefIdSets,
  reserveUniqueManufacturerCode,
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
  reason?: string;
}

interface ResolvedManufacturerCreate {
  uniqueKey: string;
  name: string;
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

Sheet Manufacture Address → manufacturers.name (address column stays null)

Options:
  --file <path>          XLSX file (default: ${DEFAULT_FILE})
  --sheet <name>         Worksheet name (default: first worksheet)
  --batch-size <number>  Creates per transaction (default: ${DEFAULT_BATCH_SIZE})
  --report <path>        JSON report output path
  --apply                Write changes (without this flag, dry-run only)

Notes:
  - Creates one manufacturer per sheet row (duplicate addresses kept)
  - Name = address + " [Product ID]" so UNIQUE(name) is satisfied
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

const loadActiveManufacturersByName = async (): Promise<Map<string, ManufacturerEntity>> => {
  const manufacturers = await AppDataSource.getRepository(ManufacturerEntity)
    .createQueryBuilder('manufacturer')
    .where('manufacturer.deletedAt IS NULL')
    .getMany();

  const byName = new Map<string, ManufacturerEntity>();
  for (const manufacturer of manufacturers) {
    byName.set(normalizeText(manufacturer.name), manufacturer);
  }
  return byName;
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
          'sheet.Manufacture Address + [Product ID] → manufacturers.name (one row per sheet row; address=null)',
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
      const entities = batch.map((item) =>
        repo.create({
          name: item.name,
          address: null,
          code: reserveUniqueManufacturerCode(item.name, reserved.codes),
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
        }),
      );
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
    '[manufacturer-address-import] Mapping: Address + [Product ID] → manufacturers.name (address=null)',
  );
  console.log('[manufacturer-address-import] Duplicate addresses: kept (one manufacturer per row)');
  console.log('[manufacturer-address-import] Products: assignments will NOT be changed');

  const sheetRows = await readManufacturerSheetRows(options.file, options.sheet);
  console.log(`[manufacturer-address-import] Non-empty sheet rows: ${sheetRows.length}`);

  const ownsDataSource = !AppDataSource.isInitialized;
  if (ownsDataSource) {
    await AppDataSource.initialize();
  }

  try {
    const manufacturersByName = await loadActiveManufacturersByName();
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

      const storedName = toStoredManufacturerName(address, productId);
      const uniqueKey = normalizeText(storedName);
      const existing = manufacturersByName.get(uniqueKey);

      if (existing) {
        reportRows.push({
          ...row,
          status: 'unchanged',
          manufacturerRefId: existing.refId,
          storedName: existing.name,
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
          reason: 'Same Product ID + address already queued from an earlier sheet row.',
        });
        continue;
      }

      createsByKey.set(uniqueKey, {
        uniqueKey,
        name: storedName,
        sourceRows: [row.rowNumber],
      });
      reportRows.push({
        ...row,
        status: 'pending_create',
        storedName,
      });
    }

    const creates = [...createsByKey.values()];
    const created = options.apply ? await applyCreates(creates, options.batchSize ?? DEFAULT_BATCH_SIZE) : 0;

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
  await runManufacturerAddressImport(parseCli(process.argv.slice(2)));
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(
      '[manufacturer-address-import] Failed:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
