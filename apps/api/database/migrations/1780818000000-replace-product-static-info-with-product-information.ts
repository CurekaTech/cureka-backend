import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

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
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "product_information" jsonb NOT NULL DEFAULT '[]'
    `);

    const products = (await queryRunner.query(`
      SELECT
        "id",
        "highlights",
        "expert_advice",
        "key_ingredients",
        "other_ingredients",
        "preventive_notes",
        "accessories_specifications",
        "directions_of_use",
        "feeding_table",
        "safety_information",
        "product_weight",
        "product_dimensions"
      FROM "products"
    `)) as LegacyProductRow[];

    for (const product of products) {
      const productInformation = LEGACY_FIELD_MAPPINGS.flatMap(({ column, label }) => {
        const value = product[column];
        if (typeof value !== 'string' || !value.trim()) {
          return [];
        }

        return [
          {
            id: randomUUID(),
            label,
            description: value.trim(),
          },
        ];
      });

      await queryRunner.query(
        `UPDATE "products" SET "product_information" = $1::jsonb WHERE "id" = $2`,
        [JSON.stringify(productInformation), product.id],
      );
    }

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
