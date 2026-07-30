import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Previous heal incorrectly forced status=inactive when value was "false",
 * even if admins had enabled GoKwik via status=active.
 * This restores status=active when the row still looks like that mistaken heal
 * only if nothing else indicates an intentional disable after deploy.
 *
 * Safer approach: only sync value←status in 1780915910000.
 * Operators must re-enable GoKwik in admin if the bad heal already ran.
 *
 * Kept as documentation no-op companion — actual restore is operator toggle + value sync.
 */
export class HealCheckoutProviderSettings1780915900000 implements MigrationInterface {
  name = 'HealCheckoutProviderSettings1780915900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Prefer status as source of truth (never deactivate based on value alone).
    await queryRunner.query(`
      UPDATE "admin_setting"
      SET
        "value" = CASE WHEN "status" = 'active' THEN 'true' ELSE 'false' END,
        "updated_by" = 'system'
      WHERE "key" IN ('gokwikCheckoutEnabled', 'shiprocketCheckoutEnabled')
    `);
  }

  public async down(): Promise<void> {
    // Irreversible data heal — no-op
  }
}
