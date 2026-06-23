import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductTagsStatusAndNameUnique1780824000000 implements MigrationInterface {
  name = 'AddProductTagsStatusAndNameUnique1780824000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_tags"
      ADD COLUMN "status" "public"."brands_status_enum" NOT NULL DEFAULT 'active'
    `);

    await queryRunner.query(`
      ALTER TABLE "product_tags"
      ALTER COLUMN "name" TYPE character varying(100)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_tags_name_active"
      ON "product_tags" ("name")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_tags_status" ON "product_tags" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_tags_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_tags_name_active"`);

    await queryRunner.query(`
      ALTER TABLE "product_tags"
      ALTER COLUMN "name" TYPE character varying(255)
    `);

    await queryRunner.query(`ALTER TABLE "product_tags" DROP COLUMN "status"`);
  }
}
