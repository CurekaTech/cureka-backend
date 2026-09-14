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
    refId: 'PER00000346',
    name: 'View Returns',
    code: 'returns.read',
    module: 'returns',
    action: 'read',
  },
  {
    refId: 'PER00000347',
    name: 'Create Returns',
    code: 'returns.create',
    module: 'returns',
    action: 'create',
  },
  {
    refId: 'PER00000348',
    name: 'Update Returns',
    code: 'returns.update',
    module: 'returns',
    action: 'update',
  },
  {
    refId: 'PER00000349',
    name: 'Approve Returns',
    code: 'returns.approve',
    module: 'returns',
    action: 'approve',
  },
  {
    refId: 'PER00000350',
    name: 'Reject Returns',
    code: 'returns.reject',
    module: 'returns',
    action: 'reject',
  },
  {
    refId: 'PER00000351',
    name: 'Progress Return Operations',
    code: 'returns.status',
    module: 'returns',
    action: 'status',
  },
  {
    refId: 'PER00000352',
    name: 'View Return Policies',
    code: 'return_policies.read',
    module: 'return_policies',
    action: 'read',
  },
  {
    refId: 'PER00000353',
    name: 'Update Return Policies',
    code: 'return_policies.update',
    module: 'return_policies',
    action: 'update',
  },
];

export class AddReturnPermissions1785981000000 implements MigrationInterface {
  name = 'AddReturnPermissions1785981000000';

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
