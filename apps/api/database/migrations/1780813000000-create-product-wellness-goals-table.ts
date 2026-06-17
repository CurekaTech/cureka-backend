import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductWellnessGoalsTable1780813000000 implements MigrationInterface {
  name = 'CreateProductWellnessGoalsTable1780813000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_wellness_goals" (
        "product_id"       uuid NOT NULL,
        "wellness_goal_id" uuid NOT NULL,
        CONSTRAINT "PK_product_wellness_goals" PRIMARY KEY ("product_id", "wellness_goal_id"),
        CONSTRAINT "FK_product_wellness_goals_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_wellness_goals_wellness_goal"
          FOREIGN KEY ("wellness_goal_id") REFERENCES "wellness_goals"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_wellness_goals_product_id"
      ON "product_wellness_goals" ("product_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_wellness_goals_product_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_wellness_goals"`);
  }
}
