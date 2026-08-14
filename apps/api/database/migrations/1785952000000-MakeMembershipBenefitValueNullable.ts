import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FREE_SHIPPING / EARLY_ACCESS / etc. use valueType=NONE with no numeric value.
 * Original table had value NOT NULL, which rejected those inserts.
 */
export class MakeMembershipBenefitValueNullable1785952000000 implements MigrationInterface {
  name = 'MakeMembershipBenefitValueNullable1785952000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "membership_benefits"
      ALTER COLUMN "value" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "membership_benefits"
      SET "value" = 0
      WHERE "value" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "membership_benefits"
      ALTER COLUMN "value" SET NOT NULL
    `);
  }
}
