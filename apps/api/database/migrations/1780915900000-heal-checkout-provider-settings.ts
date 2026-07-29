import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeded gokwikCheckoutEnabled as status=active + value=false, which made the
 * admin UI look "on" while checkout still required a truthy value.
 * Heal inconsistent rows and default off until explicitly enabled.
 */
export class HealCheckoutProviderSettings1780915900000 implements MigrationInterface {
  name = 'HealCheckoutProviderSettings1780915900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "admin_setting"
      SET
        "status" = 'inactive',
        "value" = 'false',
        "updated_by" = 'system'
      WHERE "key" IN ('gokwikCheckoutEnabled', 'shiprocketCheckoutEnabled')
        AND lower(trim("value")) IN ('false', '0', 'no', 'off')
    `);

    await queryRunner.query(`
      UPDATE "admin_setting"
      SET
        "status" = 'active',
        "value" = 'true',
        "updated_by" = 'system'
      WHERE "key" IN ('gokwikCheckoutEnabled', 'shiprocketCheckoutEnabled')
        AND lower(trim("value")) IN ('true', '1', 'yes', 'on')
    `);
  }

  public async down(): Promise<void> {
    // Irreversible data heal — no-op
  }
}
