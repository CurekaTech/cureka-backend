import { MigrationInterface, QueryRunner } from 'typeorm';

const VENDOR_TABLES = ['manufacturers', 'importers', 'packers'] as const;

const FK_CONSTRAINTS: Record<(typeof VENDOR_TABLES)[number], string[]> = {
  manufacturers: ['FK_manufacturers_city', 'FK_manufacturers_state', 'FK_manufacturers_country'],
  importers: ['FK_importers_city', 'FK_importers_state', 'FK_importers_country'],
  packers: ['FK_packers_city', 'FK_packers_state', 'FK_packers_country'],
};

const INDEXES: Record<(typeof VENDOR_TABLES)[number], string[]> = {
  manufacturers: [
    'IDX_manufacturers_city_id',
    'IDX_manufacturers_state_id',
    'IDX_manufacturers_country_id',
  ],
  importers: ['IDX_importers_city_id', 'IDX_importers_state_id', 'IDX_importers_country_id'],
  packers: ['IDX_packers_city_id', 'IDX_packers_state_id', 'IDX_packers_country_id'],
};

export class ConsolidateVendorAddressFields1780815000000 implements MigrationInterface {
  name = 'ConsolidateVendorAddressFields1780815000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of VENDOR_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "address" text`,
      );

      await queryRunner.query(`
        UPDATE "${table}"
        SET "address" = NULLIF(TRIM(BOTH FROM CONCAT_WS(', ',
          NULLIF(TRIM("address_line1"), ''),
          NULLIF(TRIM("address_line2"), ''),
          NULLIF(TRIM("landmark"), ''),
          NULLIF(TRIM("pin_code"), '')
        )), '')
        WHERE "address" IS NULL
      `);

      for (const constraint of FK_CONSTRAINTS[table]) {
        await queryRunner.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`,
        );
      }

      for (const index of INDEXES[table]) {
        await queryRunner.query(`DROP INDEX IF EXISTS "${index}"`);
      }

      await queryRunner.query(`
        ALTER TABLE "${table}"
        DROP COLUMN IF EXISTS "address_line1",
        DROP COLUMN IF EXISTS "address_line2",
        DROP COLUMN IF EXISTS "landmark",
        DROP COLUMN IF EXISTS "city_id",
        DROP COLUMN IF EXISTS "state_id",
        DROP COLUMN IF EXISTS "country_id",
        DROP COLUMN IF EXISTS "pin_code"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of VENDOR_TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "address_line1" character varying(500),
        ADD COLUMN IF NOT EXISTS "address_line2" character varying(500),
        ADD COLUMN IF NOT EXISTS "landmark" character varying(255),
        ADD COLUMN IF NOT EXISTS "city_id" uuid,
        ADD COLUMN IF NOT EXISTS "state_id" uuid,
        ADD COLUMN IF NOT EXISTS "country_id" uuid,
        ADD COLUMN IF NOT EXISTS "pin_code" character varying(20)
      `);

      await queryRunner.query(`
        UPDATE "${table}"
        SET "address_line1" = "address"
        WHERE "address" IS NOT NULL
      `);

      for (const index of INDEXES[table]) {
        const column = index.replace(`IDX_${table}_`, '').replace(/_id$/, '_id');
        await queryRunner.query(
          `CREATE INDEX IF NOT EXISTS "${index}" ON "${table}" ("${column}")`,
        );
      }

      if (table === 'manufacturers') {
        await queryRunner.query(`
          ALTER TABLE "manufacturers"
          ADD CONSTRAINT "FK_manufacturers_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL,
          ADD CONSTRAINT "FK_manufacturers_state" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL,
          ADD CONSTRAINT "FK_manufacturers_country" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL
        `);
      } else if (table === 'importers') {
        await queryRunner.query(`
          ALTER TABLE "importers"
          ADD CONSTRAINT "FK_importers_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL,
          ADD CONSTRAINT "FK_importers_state" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL,
          ADD CONSTRAINT "FK_importers_country" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL
        `);
      } else {
        await queryRunner.query(`
          ALTER TABLE "packers"
          ADD CONSTRAINT "FK_packers_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL,
          ADD CONSTRAINT "FK_packers_state" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL,
          ADD CONSTRAINT "FK_packers_country" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL
        `);
      }

      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "address"`);
    }
  }
}
