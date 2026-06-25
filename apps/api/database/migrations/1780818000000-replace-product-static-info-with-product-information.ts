import { MigrationInterface, QueryRunner } from 'typeorm';

type LegacyProductRow = {
  id: string;
  highlights: string | null;
  expert_advice: string | null;
  key_ingredients: string | null;
  other_ingredients: string | null;
  preventive_notes: string | null;
  accessories_specifications: string | null;
  directions_of_use: string | null;
  feeding_table: string | null;
  safety_information: string | null;
  product_weight: string | null;
  product_dimensions: string | null;
};

const LEGACY_FIELD_MAPPINGS: Array<{ column: keyof LegacyProductRow; label: string }> = [
  { column: 'highlights', label: 'Highlights' },
  { column: 'expert_advice', label: 'Expert Advice' },
  { column: 'key_ingredients', label: 'Key Ingredients' },
  { column: 'other_ingredients', label: 'Other Ingredients' },
  { column: 'preventive_notes', label: 'Preventive Notes' },
  { column: 'accessories_specifications', label: 'Accessories Specifications' },
  { column: 'directions_of_use', label: 'Directions of Use' },
  { column: 'feeding_table', label: 'Feeding Table' },
  { column: 'safety_information', label: 'Safety Information' },
  { column: 'product_weight', label: 'Product Weight' },
  { column: 'product_dimensions', label: 'Product Dimensions' },
];

export class ReplaceProductStaticInfoWithProductInformation1780818000000
  implements MigrationInterface
{
  name = 'ReplaceProductStaticInfoWithProductInformation1780818000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET statement_timeout = 0`);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "product_information" jsonb
    `);

    await queryRunner.query(`
      UPDATE "products"
      SET "product_information" = '[]'::jsonb
      WHERE "product_information" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ALTER COLUMN "product_information" SET DEFAULT '[]'::jsonb,
      ALTER COLUMN "product_information" SET NOT NULL
    `);

    const legacyFieldSelects = LEGACY_FIELD_MAPPINGS.map(
      ({ column, label }, index) =>
        `SELECT ${index} AS ord, '${label.replace(/'/g, "''")}' AS label, p."${column}" AS val`,
    ).join('\n          UNION ALL\n          ');

    await queryRunner.query(`
      UPDATE "products" AS p
      SET "product_information" = COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', gen_random_uuid()::text,
              'label', fields.label,
              'description', trim(fields.val)
            )
            ORDER BY fields.ord
          )
          FROM (
            ${legacyFieldSelects}
          ) AS fields
          WHERE fields.val IS NOT NULL AND trim(fields.val) <> ''
        ),
        '[]'::jsonb
      )
      WHERE EXISTS (
        SELECT 1
        FROM (
          ${legacyFieldSelects}
        ) AS fields
        WHERE fields.val IS NOT NULL AND trim(fields.val) <> ''
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "highlights",
      DROP COLUMN IF EXISTS "expert_advice",
      DROP COLUMN IF EXISTS "key_ingredients",
      DROP COLUMN IF EXISTS "other_ingredients",
      DROP COLUMN IF EXISTS "preventive_notes",
      DROP COLUMN IF EXISTS "accessories_specifications",
      DROP COLUMN IF EXISTS "directions_of_use",
      DROP COLUMN IF EXISTS "feeding_table",
      DROP COLUMN IF EXISTS "safety_information",
      DROP COLUMN IF EXISTS "product_weight",
      DROP COLUMN IF EXISTS "product_dimensions"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "highlights" text,
      ADD COLUMN IF NOT EXISTS "expert_advice" text,
      ADD COLUMN IF NOT EXISTS "key_ingredients" text,
      ADD COLUMN IF NOT EXISTS "other_ingredients" text,
      ADD COLUMN IF NOT EXISTS "preventive_notes" text,
      ADD COLUMN IF NOT EXISTS "accessories_specifications" text,
      ADD COLUMN IF NOT EXISTS "directions_of_use" text,
      ADD COLUMN IF NOT EXISTS "feeding_table" text,
      ADD COLUMN IF NOT EXISTS "safety_information" text,
      ADD COLUMN IF NOT EXISTS "product_weight" character varying(100),
      ADD COLUMN IF NOT EXISTS "product_dimensions" character varying(100)
    `);

    const products = (await queryRunner.query(`
      SELECT "id", "product_information" FROM "products"
    `)) as Array<{ id: string; product_information: Array<{ label: string; description: string }> }>;

    const labelToColumn: Record<string, keyof LegacyProductRow> = Object.fromEntries(
      LEGACY_FIELD_MAPPINGS.map(({ column, label }) => [label, column]),
    );

    for (const product of products) {
      const legacy: Partial<Record<keyof LegacyProductRow, string | null>> = {
        id: product.id,
      };

      for (const item of product.product_information ?? []) {
        const column = labelToColumn[item.label];
        if (column) {
          legacy[column] = item.description;
        }
      }

      await queryRunner.query(
        `
          UPDATE "products"
          SET
            "highlights" = $2,
            "expert_advice" = $3,
            "key_ingredients" = $4,
            "other_ingredients" = $5,
            "preventive_notes" = $6,
            "accessories_specifications" = $7,
            "directions_of_use" = $8,
            "feeding_table" = $9,
            "safety_information" = $10,
            "product_weight" = $11,
            "product_dimensions" = $12
          WHERE "id" = $1
        `,
        [
          product.id,
          legacy.highlights ?? null,
          legacy.expert_advice ?? null,
          legacy.key_ingredients ?? null,
          legacy.other_ingredients ?? null,
          legacy.preventive_notes ?? null,
          legacy.accessories_specifications ?? null,
          legacy.directions_of_use ?? null,
          legacy.feeding_table ?? null,
          legacy.safety_information ?? null,
          legacy.product_weight ?? null,
          legacy.product_dimensions ?? null,
        ],
      );
    }

    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "product_information"
    `);
  }
}
