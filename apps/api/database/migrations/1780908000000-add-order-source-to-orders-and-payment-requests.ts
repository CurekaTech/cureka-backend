import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderSourceToOrdersAndPaymentRequests1780908000000
  implements MigrationInterface
{
  name = 'AddOrderSourceToOrdersAndPaymentRequests1780908000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."orders_order_source_enum"
      AS ENUM ('Admin', 'Website', 'App')
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "order_source" "public"."orders_order_source_enum"
      NOT NULL DEFAULT 'Website'
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_order_source" ON "orders" ("order_source")
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      ADD COLUMN "order_source" "public"."orders_order_source_enum"
      NOT NULL DEFAULT 'Website'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_requests" DROP COLUMN "order_source"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_orders_order_source"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" DROP COLUMN "order_source"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."orders_order_source_enum"
    `);
  }
}
