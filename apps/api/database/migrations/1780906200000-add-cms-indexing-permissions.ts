import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  // Home Sections
  { refId: 'PER00000217', name: 'View Home Sections', code: 'home_sections.read', module: 'home_sections', action: 'read' },
  { refId: 'PER00000218', name: 'Create Home Sections', code: 'home_sections.create', module: 'home_sections', action: 'create' },
  { refId: 'PER00000219', name: 'Update Home Sections', code: 'home_sections.update', module: 'home_sections', action: 'update' },
  { refId: 'PER00000220', name: 'Change Home Sections Status', code: 'home_sections.status', module: 'home_sections', action: 'status' },
  { refId: 'PER00000221', name: 'Delete Home Sections', code: 'home_sections.delete', module: 'home_sections', action: 'delete' },

  // Header Indexing
  { refId: 'PER00000222', name: 'View Header Indexing', code: 'header_indexing.read', module: 'header_indexing', action: 'read' },
  { refId: 'PER00000223', name: 'Create Header Indexing', code: 'header_indexing.create', module: 'header_indexing', action: 'create' },
  { refId: 'PER00000224', name: 'Update Header Indexing', code: 'header_indexing.update', module: 'header_indexing', action: 'update' },
  { refId: 'PER00000225', name: 'Change Header Indexing Status', code: 'header_indexing.status', module: 'header_indexing', action: 'status' },
  { refId: 'PER00000226', name: 'Delete Header Indexing', code: 'header_indexing.delete', module: 'header_indexing', action: 'delete' },

  // Shop By Indexing
  { refId: 'PER00000227', name: 'View Shop By Indexing', code: 'shop_by_indexing.read', module: 'shop_by_indexing', action: 'read' },
  { refId: 'PER00000228', name: 'Create Shop By Indexing', code: 'shop_by_indexing.create', module: 'shop_by_indexing', action: 'create' },
  { refId: 'PER00000229', name: 'Update Shop By Indexing', code: 'shop_by_indexing.update', module: 'shop_by_indexing', action: 'update' },
  { refId: 'PER00000230', name: 'Change Shop By Indexing Status', code: 'shop_by_indexing.status', module: 'shop_by_indexing', action: 'status' },
  { refId: 'PER00000231', name: 'Delete Shop By Indexing', code: 'shop_by_indexing.delete', module: 'shop_by_indexing', action: 'delete' },

  // Watch & Shop
  { refId: 'PER00000232', name: 'View Watch & Shop', code: 'watch_and_shop.read', module: 'watch_and_shop', action: 'read' },
  { refId: 'PER00000233', name: 'Create Watch & Shop', code: 'watch_and_shop.create', module: 'watch_and_shop', action: 'create' },
  { refId: 'PER00000234', name: 'Update Watch & Shop', code: 'watch_and_shop.update', module: 'watch_and_shop', action: 'update' },
  { refId: 'PER00000235', name: 'Change Watch & Shop Status', code: 'watch_and_shop.status', module: 'watch_and_shop', action: 'status' },
  { refId: 'PER00000236', name: 'Delete Watch & Shop', code: 'watch_and_shop.delete', module: 'watch_and_shop', action: 'delete' },

  // Expert Talks
  { refId: 'PER00000237', name: 'View Expert Talks', code: 'expert_talks.read', module: 'expert_talks', action: 'read' },
  { refId: 'PER00000238', name: 'Create Expert Talks', code: 'expert_talks.create', module: 'expert_talks', action: 'create' },
  { refId: 'PER00000239', name: 'Update Expert Talks', code: 'expert_talks.update', module: 'expert_talks', action: 'update' },
  { refId: 'PER00000240', name: 'Change Expert Talks Status', code: 'expert_talks.status', module: 'expert_talks', action: 'status' },
  { refId: 'PER00000241', name: 'Delete Expert Talks', code: 'expert_talks.delete', module: 'expert_talks', action: 'delete' },
];

export class AddCmsIndexingPermissions1780906200000 implements MigrationInterface {
  name = 'AddCmsIndexingPermissions1780906200000';

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
