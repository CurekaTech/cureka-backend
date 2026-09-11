import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderSourceToCarts1785981000000 implements MigrationInterface {
  name = 'AddOrderSourceToCarts1785981000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "carts"
      ADD COLUMN IF NOT EXISTS "order_source" "public"."orders_order_source_enum" NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "carts" DROP COLUMN IF EXISTS "order_source"
    `);
  }
}
