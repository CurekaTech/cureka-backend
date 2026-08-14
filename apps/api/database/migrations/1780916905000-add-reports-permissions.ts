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
    refId: 'PER00000217',
    name: 'View Reports',
    code: 'reports.read',
    module: 'reports',
    action: 'read',
  },
  {
    refId: 'PER00000218',
    name: 'Download Reports',
    code: 'reports.export',
    module: 'reports',
    action: 'read',
  },
];

export class AddReportsPermissions1780916905000 implements MigrationInterface {
  name = 'AddReportsPermissions1780916905000';

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

