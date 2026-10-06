import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Typo and nearest-catalog product search use word_similarity.
 * Compact/space-stripped matching does not need this extension.
 */
export class EnablePgTrgm1785994000000 implements MigrationInterface {
  name = 'EnablePgTrgm1785994000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  }

  public async down(): Promise<void> {
    // Leave pg_trgm installed. Dropping it can break other similarity queries.
  }
}
