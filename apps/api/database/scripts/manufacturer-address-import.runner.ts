/**
 * Imports manufacturer name + address rows from an XLSX worksheet into manufacturers.
 *
 * Expected columns:
 *   Name | Manufacture Address
 *   (ID and SKU are read but not used for matching)
 *
 * - Creates or updates manufacturers.name + manufacturers.address
 * - Permanently deletes all soft-deleted manufacturers before import (on --apply)
 * - Does NOT change product.manufacturer_id assignments
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
  ManufacturerSheetRow,
  TEST_MANUFACTURER_NAME,
  loadManufacturerCodeRefIdSets,
  reserveUniqueManufacturerCode,
  reserveUniqueManufacturerRefId,
  normalizeText,
  readManufacturerSheetRows,
} from './manufacturer-import.shared';

const DEFAULT_FILE = 'docs/Manufacture details (1).xlsx';
const DEFAULT_BATCH_SIZE = 500;
const UPDATED_BY = 'manufacturer-address-import';
const MANUFACTURER_NAME_MAX = 255;

interface CliOptions {
  file: string;
  sheet?: string;
  apply: boolean;
  batchSize: number;
  report?: string;
}

type RowStatus =
  | 'pending_create'
  | 'pending_update'
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

interface ResolvedManufacturerUpsert {
  dedupeKey: string;
  name: string;
  address: string;
  existing?: ManufacturerEntity;
  sourceRows: number[];
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
Manufacturer sheet importer (name + address -> manufacturers table)

Options:
  --file <path>          XLSX file (default: ${DEFAULT_FILE})
  --sheet <name>         Worksheet name (default: first worksheet)
  --batch-size <number>  Writes per transaction (default: ${DEFAULT_BATCH_SIZE})
  --report <path>        JSON report output path
  --apply                Write changes (without this flag, dry-run only)

Notes:
  - Soft-deleted manufacturers are permanently removed on --apply
  - Product manufacturer assignments are NOT changed
  - ${TEST_MANUFACTURER_NAME} is preserved for existing product links
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

const buildReportPath = (options: CliOptions): string => {
  if (options.report) {
    return isAbsolute(options.report) ? options.report : resolve(process.cwd(), options.report);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(process.cwd(), 'docs', `manufacturer-address-import-${timestamp}.json`);
};

const toStoredManufacturerName = (name: string, rowId: string): string => {
  const trimmed = name.trim();
  if (trimmed.length <= MANUFACTURER_NAME_MAX) {
    return trimmed;
  }

  const suffix = rowId ? ` [${rowId}]` : '';
  const maxBaseLength = MANUFACTURER_NAME_MAX - suffix.length;
  return `${trimmed.slice(0, maxBaseLength)}${suffix}`;
};

const purgeSoftDeletedManufacturers = async (): Promise<number> => {
  const result = await AppDataSource.getRepository(ManufacturerEntity)
    .createQueryBuilder()
    .delete()
    .from(ManufacturerEntity)
    .where('deleted_at IS NOT NULL')
    .execute();

  return result.affected ?? 0;
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
  options: CliOptions,
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

const applyUpserts = async (
  creates: ResolvedManufacturerUpsert[],
  updates: ResolvedManufacturerUpsert[],
  batchSize: number,
): Promise<{ created: number; updated: number }> => {
  let created = 0;
  let updated = 0;

  const manufacturerRepo = AppDataSource.getRepository(ManufacturerEntity);
  const reserved = await loadManufacturerCodeRefIdSets(manufacturerRepo);

  for (let offset = 0; offset < creates.length; offset += batchSize) {
    const batch = creates.slice(offset, offset + batchSize);
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ManufacturerEntity);
      const entities = batch.map((item) =>
        repo.create({
          name: item.name,
          address: item.address,
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

  for (let offset = 0; offset < updates.length; offset += batchSize) {
    const batch = updates.slice(offset, offset + batchSize);
    await AppDataSource.transaction(async (manager) => {
      for (const item of batch) {
        await manager
          .createQueryBuilder()
          .update(ManufacturerEntity)
          .set({
            address: item.address,
            updatedBy: UPDATED_BY,
          })
          .where('id = :id', { id: item.existing!.id })
          .execute();
        updated += 1;
      }
    });
    console.log(
      `[manufacturer-address-import] Updated ${Math.min(offset + batch.length, updates.length)}/${updates.length}`,
    );
  }

  return { created, updated };
};

interface ManufacturerAddressImportOptions {
  file: string;
  sheet?: string;
  apply: boolean;
  batchSize?: number;
  report?: string;
}

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
  console.log('[manufacturer-address-import] Target: manufacturers (name + address)');
  console.log('[manufacturer-address-import] Products: assignments will NOT be changed');

  const sheetRows = await readManufacturerSheetRows(options.file, options.sheet);
  console.log(`[manufacturer-address-import] Non-empty sheet rows: ${sheetRows.length}`);

  const ownsDataSource = !AppDataSource.isInitialized;
  if (ownsDataSource) {
    await AppDataSource.initialize();
  }

  try {
    const softDeletedCount = await AppDataSource.getRepository(ManufacturerEntity)
      .createQueryBuilder('manufacturer')
      .withDeleted()
      .where('manufacturer.deletedAt IS NOT NULL')
      .getCount();

    console.log(
      `[manufacturer-address-import] Soft-deleted manufacturers to purge permanently: ${softDeletedCount}`,
    );

    let purged = 0;
    if (options.apply && softDeletedCount > 0) {
      purged = await purgeSoftDeletedManufacturers();
      console.log(`[manufacturer-address-import] Permanently deleted: ${purged}`);
    }

    const manufacturersByName = await loadActiveManufacturersByName();
    const reportRows: ReportRow[] = [];
    const upsertsByKey = new Map<string, ResolvedManufacturerUpsert>();
    const conflictingKeys = new Set<string>();

    for (const row of sheetRows) {
      const rawName = row.name.trim();
      const address = row.address.trim();

      if (!rawName) {
        reportRows.push({ ...row, status: 'invalid', reason: 'Name is empty.' });
        continue;
      }
      if (!address) {
        reportRows.push({ ...row, status: 'invalid', reason: 'Manufacture Address is empty.' });
        continue;
      }

      if (normalizeText(rawName) === normalizeText(TEST_MANUFACTURER_NAME)) {
        reportRows.push({
          ...row,
          status: 'skipped_placeholder',
          reason: `${TEST_MANUFACTURER_NAME} is preserved for product assignments.`,
        });
        continue;
      }

      const storedName = toStoredManufacturerName(rawName, row.id.trim());
      const dedupeKey = normalizeText(rawName);
      const existing = manufacturersByName.get(dedupeKey);

      if (existing) {
        if (normalizeText(existing.address ?? '') === normalizeText(address)) {
          reportRows.push({
            ...row,
            status: 'unchanged',
            manufacturerRefId: existing.refId,
            storedName,
          });
          continue;
        }

        const pending = upsertsByKey.get(dedupeKey);
        if (pending) {
          if (normalizeText(pending.address) !== normalizeText(address)) {
            conflictingKeys.add(dedupeKey);
            reportRows.push({
              ...row,
              status: 'conflict',
              manufacturerRefId: existing.refId,
              storedName,
              reason: `Conflicting address for "${rawName}" (rows ${pending.sourceRows.join(', ')}).`,
            });
          } else {
            pending.sourceRows.push(row.rowNumber);
            reportRows.push({
              ...row,
              status: 'duplicate_row',
              manufacturerRefId: existing.refId,
              storedName,
            });
          }
          continue;
        }

        upsertsByKey.set(dedupeKey, {
          dedupeKey,
          name: storedName,
          address,
          existing,
          sourceRows: [row.rowNumber],
        });
        reportRows.push({
          ...row,
          status: 'pending_update',
          manufacturerRefId: existing.refId,
          storedName,
        });
        continue;
      }

      const pending = upsertsByKey.get(dedupeKey);
      if (pending) {
        if (normalizeText(pending.address) !== normalizeText(address)) {
          conflictingKeys.add(dedupeKey);
          reportRows.push({
            ...row,
            status: 'conflict',
            storedName,
            reason: `Conflicting address for "${rawName}" (rows ${pending.sourceRows.join(', ')}).`,
          });
        } else {
          pending.sourceRows.push(row.rowNumber);
          reportRows.push({ ...row, status: 'duplicate_row', storedName });
        }
        continue;
      }

      upsertsByKey.set(dedupeKey, {
        dedupeKey,
        name: storedName,
        address,
        sourceRows: [row.rowNumber],
      });
      reportRows.push({ ...row, status: 'pending_create', storedName });
    }

    for (const key of conflictingKeys) {
      upsertsByKey.delete(key);
      for (const row of reportRows) {
        if (
          normalizeText(row.name) === key &&
          (row.status === 'pending_create' || row.status === 'pending_update' || row.status === 'duplicate_row')
        ) {
          row.status = 'conflict';
          row.reason ??= 'Conflicting addresses for the same name in the spreadsheet.';
        }
      }
    }

    const creates = [...upsertsByKey.values()].filter((item) => !item.existing);
    const updates = [...upsertsByKey.values()].filter((item) => item.existing);

    let created = 0;
    let updated = 0;
    if (options.apply) {
      const result = await applyUpserts(creates, updates, options.batchSize);
      created = result.created;
      updated = result.updated;
    }

    const summary = reportRows.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      },
      {
        purged_soft_deleted: purged,
        created,
        updated,
      },
    );

    await writeReport(reportPath, options, reportRows, summary);

    console.log('\n[manufacturer-address-import] Summary');
    console.log(`  Rows read                    : ${sheetRows.length}`);
    console.log(`  Soft-deleted purged          : ${options.apply ? purged : softDeletedCount} (dry-run shows pending)`);
    console.log(`  ${options.apply ? 'Created' : 'Would create'} manufacturers : ${options.apply ? created : creates.length}`);
    console.log(`  ${options.apply ? 'Updated' : 'Would update'} manufacturers : ${options.apply ? updated : updates.length}`);
    console.log(`  Unchanged                    : ${summary.unchanged ?? 0}`);
    console.log(`  Conflicts / invalid / skipped: ${(summary.conflict ?? 0) + (summary.invalid ?? 0) + (summary.skipped_placeholder ?? 0)}`);
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
