import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  { refId: 'PER00000067', name: 'View Users', code: 'users.read', module: 'users', action: 'read' },
  {
    refId: 'PER00000068',
    name: 'Create Users',
    code: 'users.create',
    module: 'users',
    action: 'create',
  },
  {
    refId: 'PER00000069',
    name: 'Update Users',
    code: 'users.update',
    module: 'users',
    action: 'update',
  },
  {
    refId: 'PER00000070',
    name: 'Change Users Status',
    code: 'users.status',
    module: 'users',
    action: 'status',
  },
  {
    refId: 'PER00000071',
    name: 'Delete Users',
    code: 'users.delete',
    module: 'users',
    action: 'delete',
  },
  {
    refId: 'PER00000072',
    name: 'View Vendors',
    code: 'vendors.read',
    module: 'vendors',
    action: 'read',
  },
  {
    refId: 'PER00000073',
    name: 'Create Vendors',
    code: 'vendors.create',
    module: 'vendors',
    action: 'create',
  },
  {
    refId: 'PER00000074',
    name: 'Update Vendors',
    code: 'vendors.update',
    module: 'vendors',
    action: 'update',
  },
  {
    refId: 'PER00000075',
    name: 'Change Vendors Status',
    code: 'vendors.status',
    module: 'vendors',
    action: 'status',
  },
  {
    refId: 'PER00000076',
    name: 'Delete Vendors',
    code: 'vendors.delete',
    module: 'vendors',
    action: 'delete',
  },
  { refId: 'PER00000077', name: 'View Orders', code: 'orders.read', module: 'orders', action: 'read' },
  {
    refId: 'PER00000078',
    name: 'Create Orders',
    code: 'orders.create',
    module: 'orders',
    action: 'create',
  },
  {
    refId: 'PER00000079',
    name: 'Update Orders',
    code: 'orders.update',
    module: 'orders',
    action: 'update',
  },
  {
    refId: 'PER00000080',
    name: 'Change Orders Status',
    code: 'orders.status',
    module: 'orders',
    action: 'status',
  },
  {
    refId: 'PER00000081',
    name: 'Delete Orders',
    code: 'orders.delete',
    module: 'orders',
    action: 'delete',
  },
  {
    refId: 'PER00000082',
    name: 'View Settings',
    code: 'settings.read',
    module: 'settings',
    action: 'read',
  },
  {
    refId: 'PER00000083',
    name: 'Update Settings',
    code: 'settings.update',
    module: 'settings',
    action: 'update',
  },
];

export class AddRbacAdminPermissions1780837000000 implements MigrationInterface {
  name = 'AddRbacAdminPermissions1780837000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admin_users"
      ADD COLUMN IF NOT EXISTS "role_id" uuid
    `);

    await queryRunner.query(`
      UPDATE "admin_users" au
      SET "role_id" = r."id"
      FROM "roles" r
      WHERE au."role_id" IS NULL
        AND r."slug" = au."role"::text
        AND r."deleted_at" IS NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_admin_users_role_id'
        ) THEN
          ALTER TABLE "admin_users"
          ADD CONSTRAINT "FK_admin_users_role_id"
          FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_users_role_id" ON "admin_users" ("role_id")
    `);

    for (const permission of permissions) {
      await queryRunner.query(
        `
          INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
          SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
          WHERE NOT EXISTS (
            SELECT 1 FROM "permissions" WHERE LOWER("code") = LOWER($2::varchar) AND "deleted_at" IS NULL
          )
        `,
        [
          permission.refId,
          permission.code,
          permission.name,
          permission.module,
          permission.action,
        ],
      );
    }

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."slug" = 'super_admin'
        AND p."code" IN (${permissions.map((permission) => `'${permission.code}'`).join(', ')})
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p ON p."code" IN ('users.read', 'vendors.read', 'orders.read', 'settings.read')
      WHERE r."slug" = 'moderator'
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
  }
}
