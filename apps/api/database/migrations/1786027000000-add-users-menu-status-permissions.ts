import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Active/Inactive Users menu rows were read-only in the role matrix, so admins
 * could not grant users.status. Add scoped status codes and grant them to roles
 * that already have the matching read (or base users.status).
 */
const NEW_PERMISSIONS = [
  {
    code: 'active_users.status',
    name: 'Change Status Active Users',
    module: 'active_users',
    action: 'status',
    readCode: 'active_users.read',
    baseCode: 'users.status',
  },
  {
    code: 'inactive_users.status',
    name: 'Change Status Inactive Users',
    module: 'inactive_users',
    action: 'status',
    readCode: 'inactive_users.read',
    baseCode: 'users.status',
  },
] as const;

export class AddUsersMenuStatusPermissions1786027000000 implements MigrationInterface {
  name = 'AddUsersMenuStatusPermissions1786027000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ max_ref }] = await queryRunner.query(`
      SELECT COALESCE(MAX(SUBSTRING("ref_id" FROM 4)::bigint), 0) AS max_ref
      FROM "permissions"
      WHERE "ref_id" ~ '^PER[0-9]{8}$'
    `);
    let nextRef = Number(max_ref);

    for (const permission of NEW_PERMISSIONS) {
      const existing = await queryRunner.query(
        `SELECT 1 FROM "permissions" WHERE LOWER("code") = LOWER($1) AND "deleted_at" IS NULL`,
        [permission.code],
      );
      if (existing.length > 0) continue;

      nextRef += 1;
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        VALUES ($1, $2, $3, $4, $5::permissions_action_enum, 'active', 'system')
      `,
        [
          `PER${String(nextRef).padStart(8, '0')}`,
          permission.code,
          permission.name,
          permission.module,
          permission.action,
        ],
      );
    }

    for (const permission of NEW_PERMISSIONS) {
      // Roles that can already view that users tab.
      await queryRunner.query(
        `
        INSERT INTO "role_permissions" ("role_id", "permission_id")
        SELECT rp."role_id", scoped."id"
        FROM "role_permissions" rp
        JOIN "permissions" read_perm
          ON read_perm."id" = rp."permission_id"
         AND read_perm."code" = $1
         AND read_perm."deleted_at" IS NULL
        JOIN "permissions" scoped
          ON scoped."code" = $2
         AND scoped."deleted_at" IS NULL
        ON CONFLICT DO NOTHING
      `,
        [permission.readCode, permission.code],
      );

      // Roles that still hold the base users.status grant.
      await queryRunner.query(
        `
        INSERT INTO "role_permissions" ("role_id", "permission_id")
        SELECT rp."role_id", scoped."id"
        FROM "role_permissions" rp
        JOIN "permissions" base
          ON base."id" = rp."permission_id"
         AND base."code" = $1
         AND base."deleted_at" IS NULL
        JOIN "permissions" scoped
          ON scoped."code" = $2
         AND scoped."deleted_at" IS NULL
        ON CONFLICT DO NOTHING
      `,
        [permission.baseCode, permission.code],
      );

      // Admin slug / assigned admin roles.
      await queryRunner.query(
        `
        INSERT INTO "role_permissions" ("role_id", "permission_id")
        SELECT r."id", p."id"
        FROM "roles" r
        JOIN "permissions" p
          ON p."code" = $1
         AND p."deleted_at" IS NULL
        WHERE r."deleted_at" IS NULL
          AND (
            r."slug" IN ('super_admin', 'admin')
            OR r."id" IN (
              SELECT au."role_id"
              FROM "admin_users" au
              WHERE au."role" = 'admin'
                AND au."deleted_at" IS NULL
                AND au."role_id" IS NOT NULL
            )
          )
        ON CONFLICT DO NOTHING
      `,
        [permission.code],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const codes = NEW_PERMISSIONS.map((permission) => permission.code);
    await queryRunner.query(
      `
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" = ANY($1))
    `,
      [codes],
    );
    await queryRunner.query(
      `
      DELETE FROM "permissions"
      WHERE "code" = ANY($1)
        AND "created_by" = 'system'
    `,
      [codes],
    );
  }
}
