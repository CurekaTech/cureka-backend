import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  {
    refId: 'PER00000270',
    name: 'View CMS Pages',
    code: 'cms_pages.read',
    module: 'cms_pages',
    action: 'read',
  },
  {
    refId: 'PER00000271',
    name: 'Create CMS Pages',
    code: 'cms_pages.create',
    module: 'cms_pages',
    action: 'create',
  },
  {
    refId: 'PER00000272',
    name: 'Update CMS Pages',
    code: 'cms_pages.update',
    module: 'cms_pages',
    action: 'update',
  },
  {
    refId: 'PER00000273',
    name: 'Change CMS Pages Status',
    code: 'cms_pages.status',
    module: 'cms_pages',
    action: 'status',
  },
  {
    refId: 'PER00000274',
    name: 'Delete CMS Pages',
    code: 'cms_pages.delete',
    module: 'cms_pages',
    action: 'delete',
  },
];

const predefinedPages = [
  { refId: 'CMP20260701', title: 'About Cureka', slug: 'about-cureka' },
  { refId: 'CMP20260702', title: 'Privacy Policy', slug: 'privacy-policy' },
  { refId: 'CMP20260703', title: 'Terms & Conditions', slug: 'terms-and-conditions' },
  { refId: 'CMP20260704', title: 'Returns & Refunds', slug: 'returns-refunds' },
  { refId: 'CMP20260705', title: 'Shipping Policy', slug: 'shipping-policy' },
] as const;

export class CreateCmsPages1780916000000 implements MigrationInterface {
  name = 'CreateCmsPages1780916000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "cms_pages_status_enum" AS ENUM ('active', 'inactive');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cms_pages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "title" varchar(255) NOT NULL,
        "slug" varchar(280) NOT NULL,
        "content" text NOT NULL DEFAULT '',
        "meta_title" varchar(255),
        "meta_description" varchar(500),
        "status" "cms_pages_status_enum" NOT NULL DEFAULT 'active',
        "is_predefined" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" varchar(255) NOT NULL,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" varchar(255),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_cms_pages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cms_pages_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_cms_pages_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cms_pages_status" ON "cms_pages" ("status")
    `);

    for (const page of predefinedPages) {
      await queryRunner.query(
        `
        INSERT INTO "cms_pages" (
          "ref_id", "title", "slug", "content", "meta_title", "meta_description",
          "status", "is_predefined", "created_by", "updated_by"
        )
        SELECT
          $1::varchar,
          $2::varchar,
          $3::varchar,
          ''::text,
          $2::varchar,
          NULL,
          'active'::cms_pages_status_enum,
          true,
          'system'::varchar,
          'system'::varchar
        WHERE NOT EXISTS (
          SELECT 1 FROM "cms_pages"
          WHERE ("slug" = $3::varchar OR "ref_id" = $1::varchar)
            AND "deleted_at" IS NULL
        )
      `,
        [page.refId, page.title, page.slug],
      );
    }

    for (const permission of permissions) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM "permissions"
          WHERE (
            LOWER("code") = LOWER($2::varchar)
            OR "ref_id" = $1::varchar
          )
          AND "deleted_at" IS NULL
        )
      `,
        [permission.refId, permission.code, permission.name, permission.module, permission.action],
      );
    }

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p
        ON p."code" IN (${permissions.map((p) => `'${p.code}'`).join(', ')})
      WHERE r."slug" IN ('super_admin', 'admin')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "permissions"
        WHERE "code" IN (${permissions.map((p) => `'${p.code}'`).join(', ')})
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "code" IN (${permissions.map((p) => `'${p.code}'`).join(', ')})
        AND "created_by" = 'system'
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "cms_pages"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cms_pages_status_enum"`);
  }
}
