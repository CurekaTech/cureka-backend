/**
 * One-shot manufacturer setup for local/dev/production bootstrap.
 *
 * Runs in order (apply mode):
 *   1. Ensure test_manufacture exists and all products point to it
 *   2. Soft-delete other active manufacturers
 *   3. Permanently purge soft-deleted manufacturers
 *   4. Import all rows from the manufacturer XLSX into manufacturers
 *
 * Skipped when:
 *   - MANUFACTURER_SETUP_SKIP=1
 *   - XLSX file is missing
 *
 * Usage:
 *   npm run manufacturer:setup
 *   MANUFACTURER_SETUP_FILE="docs/Manufacture details (1).xlsx" npm run manufacturer:setup
 */
import 'reflect-metadata';
import { access } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import { AppDataSource } from '../data-source';
import { runManufacturerReset } from './manufacturer-reset.runner';
import { runManufacturerAddressImport } from './manufacturer-address-import.runner';

const DEFAULT_FILE = 'docs/Manufacture details (1).xlsx';

const resolveFile = (): string => {
  const configured = process.env['MANUFACTURER_SETUP_FILE'] ?? DEFAULT_FILE;
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
};

async function run(): Promise<void> {
  if (process.env['MANUFACTURER_SETUP_SKIP'] === '1') {
    console.log('[manufacturer-setup] Skipped (MANUFACTURER_SETUP_SKIP=1).');
    return;
  }

  const file = resolveFile();

  try {
    await access(file);
  } catch {
    console.log(`[manufacturer-setup] Skipped — file not found: ${file}`);
    return;
  }

  console.log('[manufacturer-setup] Starting full manufacturer setup...');
  console.log(`[manufacturer-setup] Sheet: ${file}`);

  const ownsDataSource = !AppDataSource.isInitialized;
  if (ownsDataSource) {
    await AppDataSource.initialize();
  }

  try {
    console.log('\n[manufacturer-setup] Step 1/2 — reset products to test_manufacture');
    await runManufacturerReset({ apply: true });

    console.log('\n[manufacturer-setup] Step 2/2 — import manufacturers from sheet');
    await runManufacturerAddressImport({
      file,
      apply: true,
    });

    console.log('\n[manufacturer-setup] Done.');
  } finally {
    if (ownsDataSource && AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

run().catch((error) => {
  console.error('[manufacturer-setup] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
