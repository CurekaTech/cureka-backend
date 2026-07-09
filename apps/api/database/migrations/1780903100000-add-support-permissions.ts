import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  { refId: 'PER00000130', name: 'View Support Categories', code: 'support_categories.read', module: 'support', action: 'read' },
  { refId: 'PER00000131', name: 'Create Support Categories', code: 'support_categories.create', module: 'support', action: 'create' },
  { refId: 'PER00000132', name: 'Update Support Categories', code: 'support_categories.update', module: 'support', action: 'update' },
  { refId: 'PER00000133', name: 'Delete Support Categories', code: 'support_categories.delete', module: 'support', action: 'delete' },
  { refId: 'PER00000134', name: 'View Support Articles', code: 'support_articles.read', module: 'support', action: 'read' },
  { refId: 'PER00000135', name: 'Create Support Articles', code: 'support_articles.create', module: 'support', action: 'create' },
  { refId: 'PER00000136', name: 'Update Support Articles', code: 'support_articles.update', module: 'support', action: 'update' },
  { refId: 'PER00000137', name: 'Delete Support Articles', code: 'support_articles.delete', module: 'support', action: 'delete' },
  { refId: 'PER00000138', name: 'View Support FAQs', code: 'support_faqs.read', module: 'support', action: 'read' },
  { refId: 'PER00000139', name: 'Create Support FAQs', code: 'support_faqs.create', module: 'support', action: 'create' },
  { refId: 'PER00000140', name: 'Update Support FAQs', code: 'support_faqs.update', module: 'support', action: 'update' },
  { refId: 'PER00000141', name: 'Delete Support FAQs', code: 'support_faqs.delete', module: 'support', action: 'delete' },
  { refId: 'PER00000142', name: 'View Support Tickets', code: 'support_tickets.read', module: 'support', action: 'read' },
  { refId: 'PER00000143', name: 'Update Support Tickets', code: 'support_tickets.update', module: 'support', action: 'update' },
  { refId: 'PER00000144', name: 'Assign Support Tickets', code: 'support_tickets.assign', module: 'support', action: 'update' },
  { refId: 'PER00000145', name: 'View Support Reports', code: 'support_reports.read', module: 'support', action: 'read' },
];

export class AddSupportPermissions1780903100000 implements MigrationInterface {
  name = 'AddSupportPermissions1780903100000';

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
