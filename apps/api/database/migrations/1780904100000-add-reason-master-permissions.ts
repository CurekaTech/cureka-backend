import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  { refId: 'PER00000201', name: 'View Reason Masters', code: 'reason_masters.read', module: 'reason_masters', action: 'read' },
  { refId: 'PER00000202', name: 'Create Reason Masters', code: 'reason_masters.create', module: 'reason_masters', action: 'create' },
  { refId: 'PER00000203', name: 'Update Reason Masters', code: 'reason_masters.update', module: 'reason_masters', action: 'update' },
  { refId: 'PER00000204', name: 'Change Reason Masters Status', code: 'reason_masters.status', module: 'reason_masters', action: 'status' },
  { refId: 'PER00000205', name: 'Delete Reason Masters', code: 'reason_masters.delete', module: 'reason_masters', action: 'delete' },
];

export class AddReasonMasterPermissions1780904100000 implements MigrationInterface {
  name = 'AddReasonMasterPermissions1780904100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const permission of permissions) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM "permissions" WHERE LOWER("code") = LOWER($2::varchar) AND "deleted_at" IS NULL
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
