import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEXES: Array<{ name: string; table: string; column: string; activeOnly?: boolean }> = [
  { name: 'IDX_search_trgm_products_name', table: 'products', column: 'name', activeOnly: true },
  { name: 'IDX_search_trgm_products_slug', table: 'products', column: 'slug', activeOnly: true },
  { name: 'IDX_search_trgm_variants_display_name', table: 'product_variants', column: 'display_name', activeOnly: true },
  { name: 'IDX_search_trgm_variants_sku', table: 'product_variants', column: 'sku', activeOnly: true },
  { name: 'IDX_search_trgm_variants_slug', table: 'product_variants', column: 'slug', activeOnly: true },
  { name: 'IDX_search_trgm_brands_name', table: 'brands', column: 'name', activeOnly: true },
  { name: 'IDX_search_trgm_categories_name', table: 'categories', column: 'name', activeOnly: true },
  { name: 'IDX_search_trgm_variant_attribute_values', table: 'variant_attribute_values', column: 'value' },
];

export class AddProductSearchTrigramIndexes1786010000000 implements MigrationInterface {
  name = 'AddProductSearchTrigramIndexes1786010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of INDEXES) {
      const predicate = index.activeOnly ? ' WHERE deleted_at IS NULL' : '';
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${index.name}" ON "${index.table}" USING gin ("${index.column}" gin_trgm_ops)${predicate}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { name } of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}