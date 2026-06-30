import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const crud = (start: number, module: string, label: string): PermissionSeed[] => {
  const actions = [
    ['View', 'read'],
    ['Create', 'create'],
    ['Update', 'update'],
    ['Change', 'status'],
    ['Delete', 'delete'],
  ];

  return actions.map(([verb, action], index) => ({
    refId: `PER${String(start + index).padStart(8, '0')}`,
    name: `${verb} ${label}${action === 'status' ? ' Status' : ''}`,
    code: `${module}.${action}`,
    module,
    action,
  }));
};

const permissions: PermissionSeed[] = [
  {
    refId: 'PER00000001',
    name: 'View Dashboard',
    code: 'dashboard.read',
    module: 'dashboard',
    action: 'read',
  },
  ...crud(2, 'roles', 'Roles'),
  ...crud(7, 'permissions', 'Permissions'),
  ...crud(12, 'category_filters', 'Category Filters'),
  ...crud(17, 'categories', 'Categories'),
  ...crud(22, 'attributes', 'Attributes'),
  ...crud(27, 'units', 'Units'),
  ...crud(32, 'brands', 'Brands'),
  ...crud(37, 'health_concerns', 'Health Concerns'),
  ...crud(42, 'wellness_goals', 'Wellness Goals'),
  ...crud(47, 'manufacturers', 'Manufacturers'),
  ...crud(52, 'packers', 'Packers'),
  ...crud(57, 'importers', 'Importers'),
  ...crud(62, 'subscription_frequencies', 'Subscription Frequencies'),
];

export class CreateRolesAndPermissionsTables1780835000000 implements MigrationInterface {
  name = 'CreateRolesAndPermissionsTables1780835000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."permissions_action_enum" AS ENUM(
        'read',
        'create',
        'update',
        'delete',
        'status'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id"          uuid                                NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"      character varying(11)               NOT NULL,
        "code"        character varying(120)              NOT NULL,
        "name"        character varying(255)              NOT NULL,
        "module"      character varying(100)              NOT NULL,
        "action"      "public"."permissions_action_enum"  NOT NULL,
        "description" text,
        "status"      "public"."brands_status_enum"       NOT NULL DEFAULT 'active',
        "created_by"  character varying(255),
        "updated_by"  character varying(255),
        "created_at"  TIMESTAMPTZ                         NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ                         NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMPTZ,
        CONSTRAINT "PK_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_permissions_code" ON "permissions" ("code")`);
    await queryRunner.query(`CREATE INDEX "IDX_permissions_name" ON "permissions" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_permissions_module" ON "permissions" ("module")`);
    await queryRunner.query(`CREATE INDEX "IDX_permissions_action" ON "permissions" ("action")`);
    await queryRunner.query(`CREATE INDEX "IDX_permissions_status" ON "permissions" ("status")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_permissions_code_active"
      ON "permissions" (LOWER("code"))
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id"          uuid                           NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"      character varying(11)          NOT NULL,
        "name"        character varying(255)         NOT NULL,
        "slug"        character varying(120)         NOT NULL,
        "description" text,
        "status"      "public"."brands_status_enum"  NOT NULL DEFAULT 'active',
        "is_system"   boolean                        NOT NULL DEFAULT false,
        "created_by"  character varying(255),
        "updated_by"  character varying(255),
        "created_at"  TIMESTAMPTZ                    NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ                    NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMPTZ,
        CONSTRAINT "PK_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roles_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_roles_name" ON "roles" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_roles_slug" ON "roles" ("slug")`);
    await queryRunner.query(`CREATE INDEX "IDX_roles_status" ON "roles" ("status")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_roles_slug_active"
      ON "roles" (LOWER("slug"))
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id"       uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "FK_role_permissions_role_id" FOREIGN KEY ("role_id")
          REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_permissions_permission_id" FOREIGN KEY ("permission_id")
          REFERENCES "permissions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_role_permissions_role_id" ON "role_permissions" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_role_permissions_permission_id" ON "role_permissions" ("permission_id")`,
    );

    for (const permission of permissions) {
      await queryRunner.query(
        `
          INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
          VALUES ($1, $2, $3, $4, $5, 'active', 'system')
        `,
        [permission.refId, permission.code, permission.name, permission.module, permission.action],
      );
    }

    await queryRunner.query(`
      INSERT INTO "roles" ("ref_id", "name", "slug", "description", "status", "is_system", "created_by")
      VALUES
        ('ROL00000001', 'Super Admin', 'super_admin', 'Full access to all admin modules.', 'active', true, 'system'),
        ('ROL00000002', 'Admin', 'admin', 'Operational admin access to common admin modules.', 'active', true, 'system'),
        ('ROL00000003', 'Moderator', 'moderator', 'Limited read-only admin access.', 'active', true, 'system')
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."slug" = 'super_admin'
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p ON p."action" IN ('read', 'create', 'update', 'status')
      WHERE r."slug" = 'admin'
        AND p."module" NOT IN ('roles', 'permissions')
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p ON p."action" = 'read'
      WHERE r."slug" = 'moderator'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_role_permissions_permission_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_role_permissions_role_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_roles_slug_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roles_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roles_slug"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roles_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_permissions_code_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permissions_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permissions_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permissions_module"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permissions_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permissions_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."permissions_action_enum"`);
  }
}
