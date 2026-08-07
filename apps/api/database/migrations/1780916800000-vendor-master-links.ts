import { MigrationInterface, QueryRunner } from 'typeorm';

export class VendorMasterLinks1780916800000 implements MigrationInterface {
  name = 'VendorMasterLinks1780916800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "vendor_warehouses" (
        "id"              uuid                      NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"          character varying(16)     NOT NULL,
        "vendor_id"       uuid                      NOT NULL,
        "address"         text                      NOT NULL,
        "pincode"         character varying(20)     NOT NULL,
        "contact_person"  character varying(255),
        "contact_phone"   character varying(20),
        "warehouse_code"  character varying(100),
        "is_default"      boolean                   NOT NULL DEFAULT false,
        "created_by"      character varying(255),
        "updated_by"      character varying(255),
        "created_at"      TIMESTAMPTZ               NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ               NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_vendor_warehouses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vendor_warehouses_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_vendor_warehouses_vendor_id"
          FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_warehouses_vendor_id" ON "vendor_warehouses" ("vendor_id")`,
    );

    // Backfill existing single warehouse columns into child rows.
    await queryRunner.query(`
      INSERT INTO "vendor_warehouses" (
        "ref_id",
        "vendor_id",
        "address",
        "pincode",
        "contact_person",
        "contact_phone",
        "warehouse_code",
        "is_default",
        "created_by",
        "updated_by"
      )
      SELECT
        LEFT(REPLACE("id"::text, '-', ''), 16),
        "id",
        COALESCE(NULLIF(TRIM("warehouse_address"), ''), 'Unknown'),
        COALESCE(NULLIF(TRIM("warehouse_pincode"), ''), '000000'),
        "warehouse_contact_person",
        "warehouse_contact_phone",
        "warehouse_code",
        true,
        "created_by",
        "updated_by"
      FROM "vendors"
      WHERE "deleted_at" IS NULL
        AND (
          "warehouse_address" IS NOT NULL
          OR "warehouse_pincode" IS NOT NULL
        )
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_category_hierarchies" (
        "id"                        uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendor_id"                 uuid NOT NULL,
        "sort_order"                int  NOT NULL DEFAULT 0,
        "category_id"               uuid NOT NULL,
        "sub_category_id"           uuid,
        "sub_sub_category_id"       uuid,
        "sub_sub_sub_category_id"   uuid,
        CONSTRAINT "PK_vendor_category_hierarchies" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendor_category_hierarchies_vendor_id"
          FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_category_hierarchies_category_id"
          FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_vendor_category_hierarchies_sub_category_id"
          FOREIGN KEY ("sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_vendor_category_hierarchies_sub_sub_category_id"
          FOREIGN KEY ("sub_sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_vendor_category_hierarchies_sub_sub_sub_category_id"
          FOREIGN KEY ("sub_sub_sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_category_hierarchies_vendor_id" ON "vendor_category_hierarchies" ("vendor_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_category_hierarchies_vendor_sort" ON "vendor_category_hierarchies" ("vendor_id", "sort_order")`,
    );

    await queryRunner.query(`
      CREATE TABLE "vendor_brands" (
        "vendor_id" uuid NOT NULL,
        "brand_id"  uuid NOT NULL,
        CONSTRAINT "PK_vendor_brands" PRIMARY KEY ("vendor_id", "brand_id"),
        CONSTRAINT "FK_vendor_brands_vendor_id"
          FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_brands_brand_id"
          FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "vendors"
        DROP COLUMN IF EXISTS "product_categories",
        DROP COLUMN IF EXISTS "brand_details",
        DROP COLUMN IF EXISTS "warehouse_address",
        DROP COLUMN IF EXISTS "warehouse_pincode",
        DROP COLUMN IF EXISTS "warehouse_contact_person",
        DROP COLUMN IF EXISTS "warehouse_contact_phone",
        DROP COLUMN IF EXISTS "warehouse_code"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
        ADD COLUMN IF NOT EXISTS "product_categories" text,
        ADD COLUMN IF NOT EXISTS "brand_details" text,
        ADD COLUMN IF NOT EXISTS "warehouse_address" text,
        ADD COLUMN IF NOT EXISTS "warehouse_pincode" character varying(20),
        ADD COLUMN IF NOT EXISTS "warehouse_contact_person" character varying(255),
        ADD COLUMN IF NOT EXISTS "warehouse_contact_phone" character varying(20),
        ADD COLUMN IF NOT EXISTS "warehouse_code" character varying(100)
    `);

    await queryRunner.query(`
      UPDATE "vendors" v
      SET
        "warehouse_address" = w."address",
        "warehouse_pincode" = w."pincode",
        "warehouse_contact_person" = w."contact_person",
        "warehouse_contact_phone" = w."contact_phone",
        "warehouse_code" = w."warehouse_code"
      FROM (
        SELECT DISTINCT ON ("vendor_id") *
        FROM "vendor_warehouses"
        WHERE "deleted_at" IS NULL
        ORDER BY "vendor_id", "is_default" DESC, "created_at" ASC
      ) w
      WHERE v."id" = w."vendor_id"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_brands"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_category_hierarchies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_warehouses"`);
  }
}
