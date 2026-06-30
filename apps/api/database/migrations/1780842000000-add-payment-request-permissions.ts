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
    refId: 'PER00000120',
    name: 'Create Payment Requests',
    code: 'payment-request.create',
    module: 'payment-request',
    action: 'create',
  },
  {
    refId: 'PER00000121',
    name: 'View Payment Requests',
    code: 'payment-request.read',
    module: 'payment-request',
    action: 'read',
  },
  {
    refId: 'PER00000122',
    name: 'Update Payment Requests',
    code: 'payment-request.update',
    module: 'payment-request',
    action: 'update',
  },
  {
    refId: 'PER00000123',
    name: 'Delete Payment Requests',
    code: 'payment-request.delete',
    module: 'payment-request',
    action: 'delete',
  },
  {
    refId: 'PER00000124',
    name: 'Generate Payment Request Links',
    code: 'payment-request.generate-link',
    module: 'payment-request',
    action: 'create',
  },
  {
    refId: 'PER00000125',
    name: 'Cancel Payment Requests',
    code: 'payment-request.cancel',
    module: 'payment-request',
    action: 'update',
  },
  {
    refId: 'PER00000126',
    name: 'Regenerate Payment Request Links',
    code: 'payment-request.regenerate',
    module: 'payment-request',
    action: 'update',
  },
];


export class AddPaymentRequestPermissions1780842000000 implements MigrationInterface {
  name = 'AddPaymentRequestPermissions1780842000000';

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
        ON p."code" IN (${permissions.map((permission) => `'${permission.code}'`).join(', ')})
      WHERE r."slug" IN ('super_admin', 'admin', 'telecaller')
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
