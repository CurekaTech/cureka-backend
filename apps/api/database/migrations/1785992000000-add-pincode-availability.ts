import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPincodeAvailability1785992000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pincodes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "pincode" character varying(6) NOT NULL,
        "district" character varying(255) NOT NULL DEFAULT '',
        "statename" character varying(255) NOT NULL DEFAULT '',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pincodes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_pincodes_pincode" UNIQUE ("pincode")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pincode_offices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "pincode_id" uuid NOT NULL,
        "pincode" character varying(6) NOT NULL,
        "circlename" character varying(255) NOT NULL DEFAULT '',
        "regionname" character varying(255) NOT NULL DEFAULT '',
        "divisionname" character varying(255) NOT NULL DEFAULT '',
        "officename" character varying(255) NOT NULL DEFAULT '',
        "officetype" character varying(50) NOT NULL DEFAULT '',
        "delivery" character varying(100) NOT NULL DEFAULT '',
        "district" character varying(255) NOT NULL DEFAULT '',
        "statename" character varying(255) NOT NULL DEFAULT '',
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "source_hash" character varying(40) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pincode_offices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_pincode_offices_source_hash" UNIQUE ("source_hash"),
        CONSTRAINT "FK_pincode_offices_pincode" FOREIGN KEY ("pincode_id")
          REFERENCES "pincodes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pincode_offices_pincode"
      ON "pincode_offices" ("pincode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pincode_offices_pincode_id"
      ON "pincode_offices" ("pincode_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pincode_offices_district"
      ON "pincode_offices" ("district")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pincode_offices_statename"
      ON "pincode_offices" ("statename")
    `);

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

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variant_pincodes_variant"
      ON "product_variant_pincodes" ("product_variant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variant_pincodes_pincode_variant"
      ON "product_variant_pincodes" ("pincode_id", "product_variant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variant_pincodes"`);
    await queryRunner.query(`
      ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "is_pincode_managed"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "pincode_offices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pincodes"`);
  }
}
