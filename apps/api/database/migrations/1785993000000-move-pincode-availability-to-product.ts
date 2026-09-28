import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pincode availability is a product setting. Existing variant mappings are not copied;
 * every product starts All India until an admin saves the product again.
 */
export class MovePincodeAvailabilityToProduct1785993000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "is_pincode_managed" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_pincodes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "pincode_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_pincodes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_pincodes_product_pincode"
          UNIQUE ("product_id", "pincode_id"),
        CONSTRAINT "FK_product_pincodes_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_pincodes_pincode" FOREIGN KEY ("pincode_id")
          REFERENCES "pincodes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_pincodes_product"
      ON "product_pincodes" ("product_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_pincodes_pincode_product"
      ON "product_pincodes" ("pincode_id", "product_id")
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "product_variant_pincodes"`);
    await queryRunner.query(`
      ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "is_pincode_managed"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "is_pincode_managed" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_variant_pincodes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_variant_id" uuid NOT NULL,
        "pincode_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_variant_pincodes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_variant_pincodes_variant_pincode"
          UNIQUE ("product_variant_id", "pincode_id"),
        CONSTRAINT "FK_product_variant_pincodes_variant" FOREIGN KEY ("product_variant_id")
          REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_variant_pincodes_pincode" FOREIGN KEY ("pincode_id")
          REFERENCES "pincodes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "product_pincodes"`);
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN IF EXISTS "is_pincode_managed"
    `);
  }
}
