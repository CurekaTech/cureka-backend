import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  { refId: 'PER00000206', name: 'View Blog Categories', code: 'blog_categories.read', module: 'blog', action: 'read' },
  { refId: 'PER00000207', name: 'Create Blog Categories', code: 'blog_categories.create', module: 'blog', action: 'create' },
  { refId: 'PER00000208', name: 'Update Blog Categories', code: 'blog_categories.update', module: 'blog', action: 'update' },
  { refId: 'PER00000209', name: 'Delete Blog Categories', code: 'blog_categories.delete', module: 'blog', action: 'delete' },
  { refId: 'PER00000210', name: 'View Blog Posts', code: 'blog_posts.read', module: 'blog', action: 'read' },
  { refId: 'PER00000211', name: 'Create Blog Posts', code: 'blog_posts.create', module: 'blog', action: 'create' },
  { refId: 'PER00000212', name: 'Update Blog Posts', code: 'blog_posts.update', module: 'blog', action: 'update' },
  { refId: 'PER00000213', name: 'Delete Blog Posts', code: 'blog_posts.delete', module: 'blog', action: 'delete' },
  { refId: 'PER00000214', name: 'View Blog Comments', code: 'blog_comments.read', module: 'blog', action: 'read' },
  { refId: 'PER00000215', name: 'Update Blog Comments', code: 'blog_comments.update', module: 'blog', action: 'update' },
  { refId: 'PER00000216', name: 'Delete Blog Comments', code: 'blog_comments.delete', module: 'blog', action: 'delete' },
];

export class AddBlogPermissions1780905100000 implements MigrationInterface {
  name = 'AddBlogPermissions1780905100000';

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
