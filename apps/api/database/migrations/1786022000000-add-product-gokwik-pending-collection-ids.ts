import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductGokwikPendingCollectionIds1786022000000 implements MigrationInterface {
  name = 'AddProductGokwikPendingCollectionIds1786022000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "gokwik_pending_collection_ids" uuid[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "gokwik_pending_collection_ids"`,
    );
  }
}
