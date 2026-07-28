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
    refId: 'PER00000260',
    name: 'View Media Gallery',
    code: 'gallery.read',
    module: 'gallery',
    action: 'read',
  },
  {
    refId: 'PER00000261',
    name: 'Create Media Gallery',
    code: 'gallery.create',
    module: 'gallery',
    action: 'create',
  },
  {
    refId: 'PER00000262',
    name: 'Update Media Gallery',
    code: 'gallery.update',
    module: 'gallery',
    action: 'update',
  },
  {
    refId: 'PER00000263',
    name: 'Change Media Gallery Status',
    code: 'gallery.status',
    module: 'gallery',
    action: 'status',
  },
  {
    refId: 'PER00000264',
    name: 'Delete Media Gallery',
    code: 'gallery.delete',
    module: 'gallery',
    action: 'delete',
  },
];

export class AddGalleryPermissions1780915600000 implements MigrationInterface {
  name = 'AddGalleryPermissions1780915600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }
}
