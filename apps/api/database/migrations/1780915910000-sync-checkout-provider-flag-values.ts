import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1) Restore GoKwik/Shiprocket if the previous heal wrongly deactivated seed rows
 *    (status was active in admin UI, value was still "false", heal set inactive).
 * 2) Sync value ← status going forward.
 */
export class SyncCheckoutProviderFlagValues1780915910000 implements MigrationInterface {
  name = 'SyncCheckoutProviderFlagValues1780915910000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Undo mistaken deactivate for GoKwik only (seeded active + value false; heal flipped it off).
    await queryRunner.query(`
      UPDATE "admin_setting"
      SET
        "status" = 'active',
        "value" = 'true',
        "updated_by" = 'system'
      WHERE "key" = 'gokwikCheckoutEnabled'
        AND "status" = 'inactive'
        AND lower(trim("value")) IN ('false', '0', 'no', 'off')
        AND "updated_by" = 'system'
    `);

    await queryRunner.query(`
      UPDATE "admin_setting"
      SET
        "value" = CASE WHEN "status" = 'active' THEN 'true' ELSE 'false' END,
        "updated_by" = 'system'
      WHERE "key" IN ('gokwikCheckoutEnabled', 'shiprocketCheckoutEnabled')
    `);
  }

  public async down(): Promise<void> {
    // Irreversible data sync — no-op
  }
}
