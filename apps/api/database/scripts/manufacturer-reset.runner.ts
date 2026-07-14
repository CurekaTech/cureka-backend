/**
 * Prepares manufacturer master data before address import.
 *
 * 1. Ensures placeholder manufacturer exists: test_manufacture
 * 2. Assigns every active product to test_manufacture
 * 3. Hard-deletes all other manufacturers (including soft-deleted)
 *
 * Usage:
 *   npm run manufacturer:reset
 *   npm run manufacturer:reset -- --apply
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { ProductEntity } from '../../../../modules/product/entities/product.entity';
import { ManufacturerEntity } from '../../../../modules/master/entities/manufacturer.entity';
import { MasterStatus } from '../../../../modules/master/enums/master-status.enum';
import {
  TEST_MANUFACTURER_NAME,
  findManufacturerByName,
  generateUniqueManufacturerCode,
  generateUniqueManufacturerRefId,
  normalizeText,
} from './manufacturer-import.shared';
import { invalidateProductCache } from './product-cleanup.redis';

const UPDATED_BY = 'manufacturer-reset';

interface CliOptions {
  apply: boolean;
}

interface ManufacturerResetOptions {
  apply: boolean;
}

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = { apply: false };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(`
Manufacturer reset script

Options:
  --apply   Write changes (default is dry-run)
`);
      process.exit(0);
    }
    if (arg === '--apply') {
      options.apply = true;
    }
  }

  return options;
};

export const runManufacturerReset = async (options: ManufacturerResetOptions): Promise<void> => {
  console.log(
    `[manufacturer-reset] Mode: ${options.apply ? 'APPLY' : 'DRY RUN (no database changes)'}`,
  );

  const ownsDataSource = !AppDataSource.isInitialized;
  if (ownsDataSource) {
    await AppDataSource.initialize();
  }

  try {
    const manufacturerRepo = AppDataSource.getRepository(ManufacturerEntity);
    const productRepo = AppDataSource.getRepository(ProductEntity);

    let testManufacturer = await findManufacturerByName(manufacturerRepo, TEST_MANUFACTURER_NAME);
    const wouldCreateTestManufacturer = !testManufacturer;

    const allManufacturers = await manufacturerRepo
      .createQueryBuilder('manufacturer')
      .withDeleted()
      .getMany();

    const otherManufacturers = allManufacturers.filter(
      (manufacturer) => normalizeText(manufacturer.name) !== normalizeText(TEST_MANUFACTURER_NAME),
    );

    const productCount = await productRepo
      .createQueryBuilder('product')
      .where('product.deletedAt IS NULL')
      .getCount();

    console.log(`[manufacturer-reset] Active products              : ${productCount}`);
    console.log(`[manufacturer-reset] Manufacturers total          : ${allManufacturers.length}`);
    console.log(
      `[manufacturer-reset] Placeholder manufacturer       : ${wouldCreateTestManufacturer ? 'will create' : testManufacturer!.refId}`,
    );
    console.log(
      `[manufacturer-reset] Manufacturers to hard-delete   : ${otherManufacturers.length}`,
    );

    if (!options.apply) {
      console.log('\n[manufacturer-reset] Dry run complete. Re-run with --apply to execute.');
      return;
    }

    if (!testManufacturer) {
      testManufacturer = manufacturerRepo.create({
        name: TEST_MANUFACTURER_NAME,
        code: await generateUniqueManufacturerCode(manufacturerRepo, TEST_MANUFACTURER_NAME),
        refId: await generateUniqueManufacturerRefId(manufacturerRepo, TEST_MANUFACTURER_NAME),
        status: MasterStatus.ACTIVE,
        logo: null,
        description: null,
        contactPerson: null,
        email: null,
        mobileNumber: null,
        address: null,
        gstNumber: null,
        drugLicenseNumber: null,
        createdBy: UPDATED_BY,
      });
      testManufacturer = await manufacturerRepo.save(testManufacturer);
      console.log(
        `[manufacturer-reset] Created ${TEST_MANUFACTURER_NAME} (${testManufacturer.refId}, code=${testManufacturer.code})`,
      );
    }

    const assignResult = await productRepo
      .createQueryBuilder()
      .update(ProductEntity)
      .set({
        manufacturerId: testManufacturer.id,
        updatedBy: UPDATED_BY,
      })
      .where('deleted_at IS NULL')
      .execute();

    // Hard-delete every manufacturer except test_manufacture (FK products already reassigned).
    const deleteResult = await manufacturerRepo
      .createQueryBuilder()
      .delete()
      .from(ManufacturerEntity)
      .where('id != :testId', { testId: testManufacturer.id })
      .execute();

    const cache = await invalidateProductCache([], false);
    console.log('\n[manufacturer-reset] Summary');
    console.log(`  Products reassigned          : ${assignResult.affected ?? 0}`);
    console.log(`  Manufacturers hard-deleted   : ${deleteResult.affected ?? otherManufacturers.length}`);
    console.log(
      cache.connected
        ? `  Redis cache keys deleted      : ${cache.keysDeleted}`
        : '  Redis unavailable; clear product cache before verification.',
    );
  } finally {
    if (ownsDataSource && AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
};

async function runCli(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  await runManufacturerReset(options);
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('[manufacturer-reset] Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
