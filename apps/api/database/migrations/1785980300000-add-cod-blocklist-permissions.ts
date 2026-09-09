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
    refId: 'PER00000342',
    name: 'View COD Blocklist',
    code: 'cod_blocklist.read',
    module: 'cod_blocklist',
    action: 'read',
  },
  {
    refId: 'PER00000343',
    name: 'Create COD Blocklist',
    code: 'cod_blocklist.create',
    module: 'cod_blocklist',
    action: 'create',
  },
  {
    refId: 'PER00000344',
    name: 'Update COD Blocklist',
    code: 'cod_blocklist.update',
    module: 'cod_blocklist',
    action: 'update',
  },
  {
    refId: 'PER00000345',
    name: 'Delete COD Blocklist',
    code: 'cod_blocklist.delete',
    module: 'cod_blocklist',
    action: 'delete',
  },
];

export class AddCodBlocklistPermissions1785980300000 implements MigrationInterface {
  name = 'AddCodBlocklistPermissions1785980300000';

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
