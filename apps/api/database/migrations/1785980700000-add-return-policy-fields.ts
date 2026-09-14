import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the return-policy configuration used by the return workflow.
 *
 * Product columns carry defaults so existing rows keep working. Variant columns
 * are nullable: a null means "inherit the product", so no SKU is silently given
 * a policy an admin never configured.
 */
export class AddReturnPolicyFields1785980700000 implements MigrationInterface {
  name = 'AddReturnPolicyFields1785980700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'policy_window_unit_enum') THEN
          CREATE TYPE "public"."policy_window_unit_enum" AS ENUM ('HOURS', 'DAYS');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "refund_allowed" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "return_window_unit" "public"."policy_window_unit_enum" NOT NULL DEFAULT 'DAYS',
        ADD COLUMN IF NOT EXISTS "replace_window_unit" "public"."policy_window_unit_enum" NOT NULL DEFAULT 'DAYS',
        ADD COLUMN IF NOT EXISTS "return_pickup_required" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "return_qc_required" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "return_evidence_required" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "no_pickup_refund_allowed" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
        ADD COLUMN IF NOT EXISTS "refund_allowed" boolean,
        ADD COLUMN IF NOT EXISTS "return_window_unit" "public"."policy_window_unit_enum",
        ADD COLUMN IF NOT EXISTS "replace_window_unit" "public"."policy_window_unit_enum",
        ADD COLUMN IF NOT EXISTS "return_pickup_required" boolean,
        ADD COLUMN IF NOT EXISTS "return_qc_required" boolean,
        ADD COLUMN IF NOT EXISTS "return_evidence_required" boolean,
        ADD COLUMN IF NOT EXISTS "no_pickup_refund_allowed" boolean
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD COLUMN IF NOT EXISTS "return_policy_snapshot" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "reason_masters"
        ADD COLUMN IF NOT EXISTS "internal_description" text,
        ADD COLUMN IF NOT EXISTS "min_images" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "max_images" integer NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS "min_videos" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "max_videos" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "is_customer_visible" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reason_masters"
        DROP COLUMN IF EXISTS "is_customer_visible",
        DROP COLUMN IF EXISTS "max_videos",
        DROP COLUMN IF EXISTS "min_videos",
        DROP COLUMN IF EXISTS "max_images",
        DROP COLUMN IF EXISTS "min_images",
        DROP COLUMN IF EXISTS "internal_description"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items" DROP COLUMN IF EXISTS "return_policy_snapshot"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
        DROP COLUMN IF EXISTS "no_pickup_refund_allowed",
        DROP COLUMN IF EXISTS "return_evidence_required",
        DROP COLUMN IF EXISTS "return_qc_required",
        DROP COLUMN IF EXISTS "return_pickup_required",
        DROP COLUMN IF EXISTS "replace_window_unit",
        DROP COLUMN IF EXISTS "return_window_unit",
        DROP COLUMN IF EXISTS "refund_allowed"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
        DROP COLUMN IF EXISTS "no_pickup_refund_allowed",
        DROP COLUMN IF EXISTS "return_evidence_required",
        DROP COLUMN IF EXISTS "return_qc_required",
        DROP COLUMN IF EXISTS "return_pickup_required",
        DROP COLUMN IF EXISTS "replace_window_unit",
        DROP COLUMN IF EXISTS "return_window_unit",
        DROP COLUMN IF EXISTS "refund_allowed"
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."policy_window_unit_enum"`);
  }
}
