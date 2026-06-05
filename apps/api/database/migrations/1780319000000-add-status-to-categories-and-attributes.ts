import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusToCategoriesAndAttributes1780319000000 implements MigrationInterface {
  name = 'AddStatusToCategoriesAndAttributes1780319000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN "status" "public"."brands_status_enum" NOT NULL DEFAULT 'active'
    `);

    await queryRunner.query(`
      ALTER TABLE "attributes"
      ADD COLUMN "status" "public"."brands_status_enum" NOT NULL DEFAULT 'active'
    `);

    await queryRunner.query(`CREATE INDEX "IDX_categories_status" ON "categories" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_attributes_status" ON "attributes" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attributes_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_categories_status"`);
    await queryRunner.query(`ALTER TABLE "attributes" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "status"`);
  }
}
