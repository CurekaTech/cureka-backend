import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommonToProductMediaTypeEnum1780907000000 implements MigrationInterface {
  name = 'AddCommonToProductMediaTypeEnum1780907000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."product_media_type_enum" ADD VALUE IF NOT EXISTS 'common'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot remove a single enum value safely; no-op on down.
  }
}
