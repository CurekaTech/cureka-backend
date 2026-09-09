import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCodBlocklistEntries1785980200000 implements MigrationInterface {
  name = 'CreateCodBlocklistEntries1785980200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."cod_blocklist_entry_type_enum" AS ENUM ('PINCODE', 'CUSTOMER')
    `);

    await queryRunner.query(`
      CREATE TABLE "cod_blocklist_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "type" "public"."cod_blocklist_entry_type_enum" NOT NULL,
        "pincode" character varying(6),
        "customer_id" uuid,
        "mobile_number" character varying(20),
        "customer_name_snapshot" character varying(255),
        "reason" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_cod_blocklist_entries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cod_blocklist_entries_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "CHK_cod_blocklist_pincode_shape" CHECK (
          "pincode" IS NULL OR "pincode" ~ '^[0-9]{6}$'
        ),
        CONSTRAINT "CHK_cod_blocklist_type_fields" CHECK (
          (
            "type" = 'PINCODE'
            AND "pincode" IS NOT NULL
            AND "customer_id" IS NULL
            AND "mobile_number" IS NULL
          )
          OR (
            "type" = 'CUSTOMER'
            AND "pincode" IS NULL
            AND ("customer_id" IS NOT NULL OR "mobile_number" IS NOT NULL)
          )
        ),
        CONSTRAINT "FK_cod_blocklist_entries_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_cod_blocklist_entries_type" ON "cod_blocklist_entries" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cod_blocklist_entries_pincode" ON "cod_blocklist_entries" ("pincode")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cod_blocklist_entries_customer_id" ON "cod_blocklist_entries" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cod_blocklist_entries_mobile_number" ON "cod_blocklist_entries" ("mobile_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cod_blocklist_entries_is_active" ON "cod_blocklist_entries" ("is_active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cod_blocklist_entries_created_at" ON "cod_blocklist_entries" ("created_at")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_cod_blocklist_active_pincode"
      ON "cod_blocklist_entries" ("pincode")
      WHERE "type" = 'PINCODE' AND "is_active" = true AND "deleted_at" IS NULL AND "pincode" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_cod_blocklist_active_customer_id"
      ON "cod_blocklist_entries" ("customer_id")
      WHERE "type" = 'CUSTOMER' AND "is_active" = true AND "deleted_at" IS NULL AND "customer_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_cod_blocklist_active_mobile_number"
      ON "cod_blocklist_entries" ("mobile_number")
      WHERE "type" = 'CUSTOMER' AND "is_active" = true AND "deleted_at" IS NULL AND "mobile_number" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cod_blocklist_active_mobile_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cod_blocklist_active_customer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cod_blocklist_active_pincode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cod_blocklist_entries_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cod_blocklist_entries_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cod_blocklist_entries_mobile_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cod_blocklist_entries_customer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cod_blocklist_entries_pincode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cod_blocklist_entries_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cod_blocklist_entries"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."cod_blocklist_entry_type_enum"`);
  }
}
