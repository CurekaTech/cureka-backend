import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSavedForLaterItems1785980400000 implements MigrationInterface {
  name = 'CreateSavedForLaterItems1785980400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "saved_for_later_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "user_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "is_subscription" boolean NOT NULL DEFAULT false,
        "frequency" "public"."product_subscription_frequency_enum",
        "identity_key" character varying(80) NOT NULL,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_saved_for_later_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_saved_for_later_items_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "CHK_saved_for_later_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "FK_saved_for_later_items_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_saved_for_later_items_product_id" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_saved_for_later_items_variant_id" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_saved_for_later_items_user_id" ON "saved_for_later_items" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_saved_for_later_items_product_id" ON "saved_for_later_items" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_saved_for_later_items_variant_id" ON "saved_for_later_items" ("variant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_saved_for_later_items_user_created" ON "saved_for_later_items" ("user_id", "created_at")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_saved_for_later_items_user_identity"
      ON "saved_for_later_items" ("user_id", "identity_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_saved_for_later_items_user_identity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_saved_for_later_items_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_saved_for_later_items_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_saved_for_later_items_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_saved_for_later_items_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "saved_for_later_items"`);
  }
}
