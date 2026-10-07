import { MigrationInterface, QueryRunner } from 'typeorm';
import { allocateCatalogueCode } from '@modules/master/utils/catalogue-code.util';

type CodeRow = {
  id: string;
  name: string;
  created_at: string | Date;
};

export class AddCatalogueSkuCodes1785997000000 implements MigrationInterface {
  name = 'AddCatalogueSkuCodes1785997000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "sku_code" character varying(3)
    `);
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "sku_code" character varying(3)
    `);

    const brands: CodeRow[] = await queryRunner.query(
      `SELECT id, name, created_at FROM brands ORDER BY created_at ASC, id ASC`,
    );
    const categories: CodeRow[] = await queryRunner.query(
      `SELECT id, name, created_at FROM categories ORDER BY created_at ASC, id ASC`,
    );
    const rows = [
      ...brands.map((row) => ({ ...row, table: 'brands' as const, fallback: 'GEN' })),
      ...categories.map((row) => ({ ...row, table: 'categories' as const, fallback: 'CAT' })),
    ].sort((left, right) => {
      const created = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      if (created !== 0) return created;
      return left.id.localeCompare(right.id);
    });

    const taken = new Set<string>();
    for (const row of rows) {
      const code = allocateCatalogueCode(row.name ?? '', taken, row.fallback);
      taken.add(code);
      const sql =
        row.table === 'brands'
          ? `UPDATE brands SET sku_code = $1 WHERE id = $2`
          : `UPDATE categories SET sku_code = $1 WHERE id = $2`;
      await queryRunner.query(sql, [code, row.id]);
    }

    await queryRunner.query(`ALTER TABLE "brands" ALTER COLUMN "sku_code" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "sku_code" SET NOT NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_brands_sku_code" ON "brands" ("sku_code")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_categories_sku_code" ON "categories" ("sku_code")`,
    );
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_catalogue_sku_code_unique()
      RETURNS trigger AS $$
      BEGIN
        IF TG_TABLE_NAME = 'brands' THEN
          IF EXISTS (SELECT 1 FROM categories WHERE sku_code = NEW.sku_code) THEN
            RAISE EXCEPTION 'catalogue sku code % is already used by a category', NEW.sku_code;
          END IF;
        ELSE
          IF EXISTS (SELECT 1 FROM brands WHERE sku_code = NEW.sku_code) THEN
            RAISE EXCEPTION 'catalogue sku code % is already used by a brand', NEW.sku_code;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "brands_sku_code_unique_across_catalogue"
      BEFORE INSERT OR UPDATE OF sku_code ON brands
      FOR EACH ROW EXECUTE FUNCTION enforce_catalogue_sku_code_unique()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "categories_sku_code_unique_across_catalogue"
      BEFORE INSERT OR UPDATE OF sku_code ON categories
      FOR EACH ROW EXECUTE FUNCTION enforce_catalogue_sku_code_unique()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "categories_sku_code_unique_across_catalogue" ON categories`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "brands_sku_code_unique_across_catalogue" ON brands`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_catalogue_sku_code_unique()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_categories_sku_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_brands_sku_code"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "sku_code"`);
    await queryRunner.query(`ALTER TABLE "brands" DROP COLUMN IF EXISTS "sku_code"`);
  }
}
