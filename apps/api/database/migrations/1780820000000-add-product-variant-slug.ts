import { MigrationInterface, QueryRunner } from 'typeorm';

type VariantRow = {
  id: string;
  sku: string;
  product_slug: string;
  attribute_values: string[] | null;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const buildVariantSlug = (
  productSlug: string,
  sku: string,
  attributeValues: string[],
): string => {
  const attributeSuffix = attributeValues.map(slugify).filter(Boolean).join('-');
  if (attributeSuffix) {
    return `${productSlug}-${attributeSuffix}`.slice(0, 480);
  }

  const skuSuffix = slugify(sku);
  if (skuSuffix) {
    return `${productSlug}-${skuSuffix}`.slice(0, 480);
  }

  return productSlug.slice(0, 480);
};

export class AddProductVariantSlug1780820000000 implements MigrationInterface {
  name = 'AddProductVariantSlug1780820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "slug" character varying(500)
    `);

    const variants = (await queryRunner.query(`
      SELECT
        pv.id,
        pv.sku,
        pv.product_id,
        p.slug AS product_slug,
        ARRAY_AGG(vav.value ORDER BY a.name, vav.value)
          FILTER (WHERE vav.value IS NOT NULL) AS attribute_values
      FROM "product_variants" pv
      INNER JOIN "products" p ON p.id = pv.product_id
      LEFT JOIN "variant_attribute_values" vav ON vav.variant_id = pv.id
      LEFT JOIN "attributes" a ON a.id = vav.attribute_id
      WHERE pv.deleted_at IS NULL
      GROUP BY pv.id, pv.sku, pv.product_id, p.slug
    `)) as VariantRow[];

    const usedSlugs = new Set<string>();

    for (const variant of variants) {
      const attributeValues = (variant.attribute_values ?? []).filter(Boolean);
      const slug = this.allocateUniqueSlug(
        buildVariantSlug(variant.product_slug, variant.sku, attributeValues),
        usedSlugs,
      );
      usedSlugs.add(slug);

      await queryRunner.query(`UPDATE "product_variants" SET "slug" = $1 WHERE "id" = $2`, [
        slug,
        variant.id,
      ]);
    }

    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ALTER COLUMN "slug" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_slug"
      ON "product_variants" ("slug")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_product_variants_slug_active"
      ON "product_variants" ("slug")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_variants_slug_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_variants_slug"`);
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "slug"`);
  }

  private allocateUniqueSlug(base: string, usedSlugs: Set<string>): string {
    let candidate = base.slice(0, 480);
    let counter = 2;

    while (usedSlugs.has(candidate)) {
      candidate = `${base.slice(0, 470)}-${counter}`.slice(0, 480);
      counter += 1;
    }

    return candidate;
  }
}
