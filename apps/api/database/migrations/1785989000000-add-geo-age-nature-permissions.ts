import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  // Countries
  { refId: 'PER00000391', name: 'View Countries', code: 'countries.read', module: 'countries', action: 'read' },
  { refId: 'PER00000392', name: 'Create Countries', code: 'countries.create', module: 'countries', action: 'create' },
  { refId: 'PER00000393', name: 'Update Countries', code: 'countries.update', module: 'countries', action: 'update' },
  { refId: 'PER00000394', name: 'Change Countries Status', code: 'countries.status', module: 'countries', action: 'status' },
  { refId: 'PER00000395', name: 'Delete Countries', code: 'countries.delete', module: 'countries', action: 'delete' },
  // States
  { refId: 'PER00000396', name: 'View States', code: 'states.read', module: 'states', action: 'read' },
  { refId: 'PER00000397', name: 'Create States', code: 'states.create', module: 'states', action: 'create' },
  { refId: 'PER00000398', name: 'Update States', code: 'states.update', module: 'states', action: 'update' },
  { refId: 'PER00000399', name: 'Change States Status', code: 'states.status', module: 'states', action: 'status' },
  { refId: 'PER00000400', name: 'Delete States', code: 'states.delete', module: 'states', action: 'delete' },
  // Cities
  { refId: 'PER00000401', name: 'View Cities', code: 'cities.read', module: 'cities', action: 'read' },
  { refId: 'PER00000402', name: 'Create Cities', code: 'cities.create', module: 'cities', action: 'create' },
  { refId: 'PER00000403', name: 'Update Cities', code: 'cities.update', module: 'cities', action: 'update' },
  { refId: 'PER00000404', name: 'Change Cities Status', code: 'cities.status', module: 'cities', action: 'status' },
  { refId: 'PER00000405', name: 'Delete Cities', code: 'cities.delete', module: 'cities', action: 'delete' },
  // Age groups
  { refId: 'PER00000406', name: 'View Age Groups', code: 'age_groups.read', module: 'age_groups', action: 'read' },
  { refId: 'PER00000407', name: 'Create Age Groups', code: 'age_groups.create', module: 'age_groups', action: 'create' },
  { refId: 'PER00000408', name: 'Update Age Groups', code: 'age_groups.update', module: 'age_groups', action: 'update' },
  { refId: 'PER00000409', name: 'Change Age Groups Status', code: 'age_groups.status', module: 'age_groups', action: 'status' },
  { refId: 'PER00000410', name: 'Delete Age Groups', code: 'age_groups.delete', module: 'age_groups', action: 'delete' },
  // Product natures
  { refId: 'PER00000411', name: 'View Product Natures', code: 'product_natures.read', module: 'product_natures', action: 'read' },
  { refId: 'PER00000412', name: 'Create Product Natures', code: 'product_natures.create', module: 'product_natures', action: 'create' },
  { refId: 'PER00000413', name: 'Update Product Natures', code: 'product_natures.update', module: 'product_natures', action: 'update' },
  { refId: 'PER00000414', name: 'Change Product Natures Status', code: 'product_natures.status', module: 'product_natures', action: 'status' },
  { refId: 'PER00000415', name: 'Delete Product Natures', code: 'product_natures.delete', module: 'product_natures', action: 'delete' },
];

export class AddGeoAgeNaturePermissions1785989000000 implements MigrationInterface {
  name = 'AddGeoAgeNaturePermissions1785989000000';

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
