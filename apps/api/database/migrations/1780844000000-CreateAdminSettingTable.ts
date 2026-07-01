import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminSettingTable1780844000000 implements MigrationInterface {
  name = 'CreateAdminSettingTable1780844000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."admin_settings_status_enum"
      AS ENUM ('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_setting" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(11) NOT NULL,
        "key" character varying(100) NOT NULL,
        "value" text NOT NULL,
        "status" "public"."admin_settings_status_enum" NOT NULL DEFAULT 'active',
        "description" text,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_admin_setting" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_setting_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_admin_setting_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_admin_setting_key" ON "admin_setting" ("key")`);

    // Seed default records
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES 
        ('SET20261001', 'discount_charges', '900', 'active', 'Default discount charge applied to eligible orders.', 'system'),
        ('SET20261002', 'razor_pay', '1', 'active', 'Controls whether Razorpay is enabled. (1 = Enabled, 0 = Disabled)', 'system'),
        ('SET20261003', 'cash_free', '0', 'inactive', 'Controls whether Cashfree is enabled. (1 = Enabled, 0 = Disabled)', 'system'),
        ('SET20261004', 'pay_you', '0', 'inactive', 'Controls whether PayU is enabled. (1 = Enabled, 0 = Disabled)', 'system')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_setting_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_setting"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."admin_settings_status_enum"`);
  }
}
