import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductModuleTables1780508000000 implements MigrationInterface {
  name = 'CreateProductModuleTables1780508000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."products_product_type_enum"
      AS ENUM ('simple', 'variable', 'bundle')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."products_status_enum"
      AS ENUM ('draft', 'published', 'archived', 'inactive')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."product_variants_status_enum"
      AS ENUM ('active', 'inactive')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."product_media_type_enum"
      AS ENUM ('image', 'video', 'size_chart')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."product_faqs_status_enum"
      AS ENUM ('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"                      uuid                                  NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"                  character varying(11)                 NOT NULL,
        "vendor_id"               uuid,
        "name"                    character varying(500)                NOT NULL,
        "slug"                    character varying(500)                NOT NULL,
        "description"             text,
        "product_type"            "public"."products_product_type_enum" NOT NULL,
        "product_nature_id"       uuid                                  NOT NULL,
        "category_id"             uuid                                  NOT NULL,
        "sub_category_id"         uuid,
        "sub_sub_category_id"     uuid,
        "sub_sub_sub_category_id" uuid,
        "brand_id"                uuid,
        "manufacturer_id"         uuid,
        "packer_id"               uuid,
        "importer_id"             uuid,
        "status"                  "public"."products_status_enum"       NOT NULL DEFAULT 'draft',
        "subscription_enabled"    boolean                               NOT NULL DEFAULT false,
        "cod_available"           boolean                               NOT NULL DEFAULT false,
        "emi_available"           boolean                               NOT NULL DEFAULT false,
        "replace_allowed"         boolean                               NOT NULL DEFAULT false,
        "replace_window_days"     integer,
        "return_window_days"      integer,
        "meta_title"              character varying(255),
        "meta_description"        text,
        "meta_keywords"           jsonb,
        "published_at"            TIMESTAMPTZ,
        "created_by"              character varying(255),
        "updated_by"              character varying(255),
        "created_at"              TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "deleted_at"              TIMESTAMPTZ,
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_products_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_products_product_nature" FOREIGN KEY ("product_nature_id") REFERENCES "product_natures"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_products_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_products_sub_category" FOREIGN KEY ("sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_products_sub_sub_category" FOREIGN KEY ("sub_sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_products_sub_sub_sub_category" FOREIGN KEY ("sub_sub_sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_products_brand" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_products_manufacturer" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_products_packer" FOREIGN KEY ("packer_id") REFERENCES "packers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_products_importer" FOREIGN KEY ("importer_id") REFERENCES "importers"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_variants" (
        "id"                   uuid                                      NOT NULL DEFAULT uuid_generate_v4(),
        "product_id"           uuid                                      NOT NULL,
        "sku"                  character varying(100)                    NOT NULL,
        "vendor_sku"           character varying(100),
        "barcode"              character varying(100),
        "mrp"                  numeric(12,2)                             NOT NULL,
        "selling_price"        numeric(12,2)                             NOT NULL,
        "discount_percentage"  numeric(5,2),
        "stock"                integer                                   NOT NULL DEFAULT 0,
        "weight"               numeric(10,3),
        "length"               numeric(10,2),
        "width"                numeric(10,2),
        "height"               numeric(10,2),
        "expires_in"           integer,
        "status"               "public"."product_variants_status_enum"   NOT NULL DEFAULT 'active',
        "combination_key"      character varying(500),
        "created_at"           TIMESTAMPTZ                               NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ                               NOT NULL DEFAULT now(),
        "deleted_at"           TIMESTAMPTZ,
        CONSTRAINT "PK_product_variants" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_variants_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_product_variants_selling_price" CHECK ("selling_price" <= "mrp"),
        CONSTRAINT "CHK_product_variants_discount" CHECK ("discount_percentage" IS NULL OR ("discount_percentage" >= 0 AND "discount_percentage" <= 100))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "variant_attribute_values" (
        "id"           uuid NOT NULL DEFAULT uuid_generate_v4(),
        "variant_id"   uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        "value"        character varying(255) NOT NULL,
        CONSTRAINT "PK_variant_attribute_values" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_variant_attribute" UNIQUE ("variant_id", "attribute_id"),
        CONSTRAINT "FK_variant_attribute_values_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_variant_attribute_values_attribute" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_media" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id"  uuid NOT NULL,
        "variant_id"  uuid,
        "type"        "public"."product_media_type_enum" NOT NULL,
        "url"         character varying(1000) NOT NULL,
        "sort_order"  integer NOT NULL DEFAULT 0,
        "is_primary"  boolean NOT NULL DEFAULT false,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_media" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_media_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_media_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_health_concerns" (
        "product_id"         uuid NOT NULL,
        "health_concern_id"  uuid NOT NULL,
        CONSTRAINT "PK_product_health_concerns" PRIMARY KEY ("product_id", "health_concern_id"),
        CONSTRAINT "FK_product_health_concerns_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_health_concerns_health_concern" FOREIGN KEY ("health_concern_id") REFERENCES "health_concerns"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_tags" (
        "id"         uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"     character varying(11) NOT NULL,
        "name"       character varying(255) NOT NULL,
        "slug"       character varying(300) NOT NULL,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_product_tags" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_tags_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_tag_mappings" (
        "product_id" uuid NOT NULL,
        "tag_id"     uuid NOT NULL,
        CONSTRAINT "PK_product_tag_mappings" PRIMARY KEY ("product_id", "tag_id"),
        CONSTRAINT "FK_product_tag_mappings_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_tag_mappings_tag" FOREIGN KEY ("tag_id") REFERENCES "product_tags"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_bundles" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "parent_product_id" uuid NOT NULL,
        "child_product_id"  uuid NOT NULL,
        "quantity"          integer NOT NULL DEFAULT 1,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_bundles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_bundle_child" UNIQUE ("parent_product_id", "child_product_id"),
        CONSTRAINT "FK_product_bundles_parent" FOREIGN KEY ("parent_product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_bundles_child" FOREIGN KEY ("child_product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_product_bundles_quantity" CHECK ("quantity" > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_faqs" (
        "id"         uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"     character varying(11) NOT NULL,
        "question"   text NOT NULL,
        "answer"     text NOT NULL,
        "status"     "public"."product_faqs_status_enum" NOT NULL DEFAULT 'active',
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_product_faqs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_faqs_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_faq_mappings" (
        "product_id"     uuid NOT NULL,
        "product_faq_id" uuid NOT NULL,
        CONSTRAINT "PK_product_faq_mappings" PRIMARY KEY ("product_id", "product_faq_id"),
        CONSTRAINT "FK_product_faq_mappings_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_faq_mappings_product_faq" FOREIGN KEY ("product_faq_id") REFERENCES "product_faqs"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_products_vendor_id" ON "products" ("vendor_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_slug" ON "products" ("slug")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_product_type" ON "products" ("product_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_status" ON "products" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_category_id" ON "products" ("category_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_brand_id" ON "products" ("brand_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_published_at" ON "products" ("published_at")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_products_slug_active" ON "products" ("slug") WHERE "deleted_at" IS NULL`);

    await queryRunner.query(`CREATE INDEX "IDX_product_variants_product_id" ON "product_variants" ("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_product_variants_sku" ON "product_variants" ("sku")`);
    await queryRunner.query(`CREATE INDEX "IDX_product_variants_status" ON "product_variants" ("status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_product_variants_sku_active" ON "product_variants" ("sku") WHERE "deleted_at" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_product_variants_vendor_sku_active" ON "product_variants" ("vendor_sku") WHERE "vendor_sku" IS NOT NULL AND "deleted_at" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_product_variants_combination" ON "product_variants" ("product_id", "combination_key") WHERE "combination_key" IS NOT NULL AND "deleted_at" IS NULL`);

    await queryRunner.query(`CREATE INDEX "IDX_variant_attribute_values_variant_id" ON "variant_attribute_values" ("variant_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_variant_attribute_values_attribute_id" ON "variant_attribute_values" ("attribute_id")`);

    await queryRunner.query(`CREATE INDEX "IDX_product_media_product_id" ON "product_media" ("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_product_media_variant_id" ON "product_media" ("variant_id")`);

    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_product_tags_slug_active" ON "product_tags" ("slug") WHERE "deleted_at" IS NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_product_faqs_status" ON "product_faqs" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_faq_mappings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_faqs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_bundles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_tag_mappings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_tags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_health_concerns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_media"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "variant_attribute_values"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."product_faqs_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."product_media_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."product_variants_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."products_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."products_product_type_enum"`);
  }
}
