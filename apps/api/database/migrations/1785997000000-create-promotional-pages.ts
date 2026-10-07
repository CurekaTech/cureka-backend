import { MigrationInterface, QueryRunner } from 'typeorm';

const permissions = [
  {
    refId: 'PER00000416',
    name: 'View Promotional Landing Pages',
    code: 'promotional_landing_pages.read',
    action: 'read',
  },
  {
    refId: 'PER00000417',
    name: 'Create Promotional Landing Pages',
    code: 'promotional_landing_pages.create',
    action: 'create',
  },
  {
    refId: 'PER00000418',
    name: 'Update Promotional Landing Pages',
    code: 'promotional_landing_pages.update',
    action: 'update',
  },
  {
    refId: 'PER00000419',
    name: 'Change Promotional Landing Pages Status',
    code: 'promotional_landing_pages.status',
    action: 'status',
  },
  {
    refId: 'PER00000420',
    name: 'Delete Promotional Landing Pages',
    code: 'promotional_landing_pages.delete',
    action: 'delete',
  },
  {
    refId: 'PER00000421',
    name: 'Preview Promotional Landing Pages',
    code: 'promotional_landing_pages.preview',
    action: 'read',
  },
];

export class CreatePromotionalPages1785997000000 implements MigrationInterface {
  name = 'CreatePromotionalPages1785997000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "promotional_pages_status_enum" AS ENUM (
        'draft',
        'scheduled',
        'published',
        'unpublished',
        'expired',
        'archived'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "promotional_page_sections_type_enum" AS ENUM (
        'heroBanner',
        'productCollection',
        'category',
        'brand',
        'video',
        'blog'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "promotional_target_type_enum" AS ENUM (
        'product',
        'category',
        'brand',
        'blog'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "promotional_pages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "name" character varying(255) NOT NULL,
        "slug" character varying(280) NOT NULL,
        "title" character varying(255) NOT NULL,
        "meta_title" character varying(255),
        "meta_description" character varying(500),
        "status" "promotional_pages_status_enum" NOT NULL DEFAULT 'draft',
        "start_at" TIMESTAMPTZ,
        "end_at" TIMESTAMPTZ,
        "coupon_id" uuid,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_promotional_pages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_promotional_pages_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_promotional_pages_coupon" FOREIGN KEY ("coupon_id")
          REFERENCES "coupons" ("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_promotional_pages_schedule"
          CHECK ("end_at" IS NULL OR "start_at" IS NULL OR "end_at" >= "start_at")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_promotional_pages_slug_active"
      ON "promotional_pages" ("slug")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_promotional_pages_status" ON "promotional_pages" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_promotional_pages_schedule" ON "promotional_pages" ("start_at", "end_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_promotional_pages_coupon_id" ON "promotional_pages" ("coupon_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "promotional_page_sections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "promotional_page_id" uuid NOT NULL,
        "type" "promotional_page_sections_type_enum" NOT NULL,
        "title" character varying(255),
        "subtitle" character varying(500),
        "config" jsonb NOT NULL DEFAULT '{}',
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "start_at" TIMESTAMPTZ,
        "end_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_promotional_page_sections" PRIMARY KEY ("id"),
        CONSTRAINT "FK_promotional_page_sections_page" FOREIGN KEY ("promotional_page_id")
          REFERENCES "promotional_pages" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_promotional_page_sections_schedule"
          CHECK ("end_at" IS NULL OR "start_at" IS NULL OR "end_at" >= "start_at")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_promotional_page_sections_page_sort"
      ON "promotional_page_sections" ("promotional_page_id", "sort_order")
    `);

    await queryRunner.query(`
      CREATE TABLE "promotional_page_section_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "section_id" uuid NOT NULL,
        "target_type" "promotional_target_type_enum" NOT NULL,
        "target_ref_id" character varying(16) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_promotional_page_section_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_promotional_page_section_items_section" FOREIGN KEY ("section_id")
          REFERENCES "promotional_page_sections" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_promotional_page_section_items_section_sort"
      ON "promotional_page_section_items" ("section_id", "sort_order")
    `);

    await queryRunner.query(`
      CREATE TABLE "promotional_page_targets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "promotional_page_id" uuid NOT NULL,
        "target_type" "promotional_target_type_enum" NOT NULL,
        "target_ref_id" character varying(16) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_promotional_page_targets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_promotional_page_targets_page" FOREIGN KEY ("promotional_page_id")
          REFERENCES "promotional_pages" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_promotional_page_targets_page_sort"
      ON "promotional_page_targets" ("promotional_page_id", "sort_order")
    `);

    for (const permission of permissions) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        SELECT $1::varchar, $2::varchar, $3::varchar, 'promotional_landing_pages', $4::permissions_action_enum, 'active', 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM "permissions"
          WHERE (
            LOWER("code") = LOWER($2::varchar)
            OR "ref_id" = $1::varchar
          )
          AND "deleted_at" IS NULL
        )
      `,
        [permission.refId, permission.code, permission.name, permission.action],
      );
    }

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p
        ON p."code" IN (${permissions.map((permission) => `'${permission.code}'`).join(', ')})
      WHERE r."slug" IN ('super_admin', 'admin')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "permissions"
        WHERE "code" IN (${permissions.map((permission) => `'${permission.code}'`).join(', ')})
      )
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "code" IN (${permissions.map((permission) => `'${permission.code}'`).join(', ')})
        AND "created_by" = 'system'
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "promotional_page_targets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promotional_page_section_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promotional_page_sections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promotional_pages"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "promotional_target_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "promotional_page_sections_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "promotional_pages_status_enum"`);
  }
}
