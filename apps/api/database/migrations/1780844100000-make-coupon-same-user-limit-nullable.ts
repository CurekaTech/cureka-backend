import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeCouponSameUserLimitNullable1780844100000 implements MigrationInterface {
  name = 'MakeCouponSameUserLimitNullable1780844100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "coupons"
      ALTER COLUMN "same_user_limit" DROP NOT NULL,
      ALTER COLUMN "same_user_limit" DROP DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "coupons" SET "same_user_limit" = 1 WHERE "same_user_limit" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "coupons"
      ALTER COLUMN "same_user_limit" SET DEFAULT 1,
      ALTER COLUMN "same_user_limit" SET NOT NULL
    `);
  }
}
