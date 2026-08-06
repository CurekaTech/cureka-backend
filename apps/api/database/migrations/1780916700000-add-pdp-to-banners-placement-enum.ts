import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPdpToBannersPlacementEnum1780916700000 implements MigrationInterface {
  name = 'AddPdpToBannersPlacementEnum1780916700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."banners_placement_enum" ADD VALUE IF NOT EXISTS 'pdp'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot remove a single enum value safely; no-op on down.
  }
}
