import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  { refId: 'PER00000300', name: 'View Membership Plans', code: 'membership_plans.read', module: 'membership_plans', action: 'read' },
  { refId: 'PER00000301', name: 'Create Membership Plans', code: 'membership_plans.create', module: 'membership_plans', action: 'create' },
  { refId: 'PER00000302', name: 'Update Membership Plans', code: 'membership_plans.update', module: 'membership_plans', action: 'update' },
  { refId: 'PER00000303', name: 'Change Membership Plans Status', code: 'membership_plans.status', module: 'membership_plans', action: 'status' },
  { refId: 'PER00000304', name: 'Delete Membership Plans', code: 'membership_plans.delete', module: 'membership_plans', action: 'delete' },
  { refId: 'PER00000305', name: 'View Membership Benefits', code: 'membership_benefits.read', module: 'membership_benefits', action: 'read' },
  { refId: 'PER00000306', name: 'Create Membership Benefits', code: 'membership_benefits.create', module: 'membership_benefits', action: 'create' },
  { refId: 'PER00000307', name: 'Update Membership Benefits', code: 'membership_benefits.update', module: 'membership_benefits', action: 'update' },
  { refId: 'PER00000308', name: 'Change Membership Benefits Status', code: 'membership_benefits.status', module: 'membership_benefits', action: 'status' },
  { refId: 'PER00000309', name: 'Delete Membership Benefits', code: 'membership_benefits.delete', module: 'membership_benefits', action: 'delete' },
  { refId: 'PER00000310', name: 'View User Memberships', code: 'user_memberships.read', module: 'user_memberships', action: 'read' },
  { refId: 'PER00000311', name: 'Create User Memberships', code: 'user_memberships.create', module: 'user_memberships', action: 'create' },
  { refId: 'PER00000312', name: 'Update User Memberships', code: 'user_memberships.update', module: 'user_memberships', action: 'update' },
  { refId: 'PER00000313', name: 'Change User Memberships Status', code: 'user_memberships.status', module: 'user_memberships', action: 'status' },
  { refId: 'PER00000314', name: 'Delete User Memberships', code: 'user_memberships.delete', module: 'user_memberships', action: 'delete' },
  { refId: 'PER00000315', name: 'View Membership Payments', code: 'membership_payments.read', module: 'membership_payments', action: 'read' },
  { refId: 'PER00000316', name: 'Create Membership Payments', code: 'membership_payments.create', module: 'membership_payments', action: 'create' },
  { refId: 'PER00000317', name: 'Update Membership Payments', code: 'membership_payments.update', module: 'membership_payments', action: 'update' },
  { refId: 'PER00000318', name: 'Change Membership Payments Status', code: 'membership_payments.status', module: 'membership_payments', action: 'status' },
  { refId: 'PER00000319', name: 'Delete Membership Payments', code: 'membership_payments.delete', module: 'membership_payments', action: 'delete' },
  { refId: 'PER00000320', name: 'View User Product Subscriptions', code: 'user_product_subscriptions.read', module: 'user_product_subscriptions', action: 'read' },
  { refId: 'PER00000321', name: 'Create User Product Subscriptions', code: 'user_product_subscriptions.create', module: 'user_product_subscriptions', action: 'create' },
  { refId: 'PER00000322', name: 'Update User Product Subscriptions', code: 'user_product_subscriptions.update', module: 'user_product_subscriptions', action: 'update' },
  { refId: 'PER00000323', name: 'Change User Product Subscriptions Status', code: 'user_product_subscriptions.status', module: 'user_product_subscriptions', action: 'status' },
  { refId: 'PER00000324', name: 'Delete User Product Subscriptions', code: 'user_product_subscriptions.delete', module: 'user_product_subscriptions', action: 'delete' },
  { refId: 'PER00000325', name: 'View Subscription Payments', code: 'subscription_payments.read', module: 'subscription_payments', action: 'read' },
  { refId: 'PER00000326', name: 'Create Subscription Payments', code: 'subscription_payments.create', module: 'subscription_payments', action: 'create' },
  { refId: 'PER00000327', name: 'Update Subscription Payments', code: 'subscription_payments.update', module: 'subscription_payments', action: 'update' },
  { refId: 'PER00000328', name: 'Change Subscription Payments Status', code: 'subscription_payments.status', module: 'subscription_payments', action: 'status' },
  { refId: 'PER00000329', name: 'Delete Subscription Payments', code: 'subscription_payments.delete', module: 'subscription_payments', action: 'delete' },
];

export class AddSubscriptionPermissions1785951000000 implements MigrationInterface {
  name = 'AddSubscriptionPermissions1785951000000';

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
