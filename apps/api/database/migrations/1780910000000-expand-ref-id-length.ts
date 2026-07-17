import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expands ref_id / *_ref_id varchar columns to length 16 so bulk uploads can use
 * a 6-digit random suffix (AAA2026123456) without exhausting the old 10k-per-prefix space.
 */
export class ExpandRefIdLength1780910000000 implements MigrationInterface {
  name = 'ExpandRefIdLength1780910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ table_name: string; column_name: string }> = await queryRunner.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type = 'character varying'
        AND character_maximum_length IS NOT NULL
        AND character_maximum_length < 16
        AND (
          column_name = 'ref_id'
          OR column_name LIKE '%\\_ref\\_id' ESCAPE '\\'
        )
      ORDER BY table_name, column_name
    `);

    for (const { table_name, column_name } of columns) {
      await queryRunner.query(
        `ALTER TABLE "${table_name}" ALTER COLUMN "${column_name}" TYPE character varying(16)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ table_name: string; column_name: string }> = await queryRunner.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type = 'character varying'
        AND character_maximum_length = 16
        AND (
          column_name = 'ref_id'
          OR column_name LIKE '%\\_ref\\_id' ESCAPE '\\'
        )
      ORDER BY table_name, column_name
    `);

    for (const { table_name, column_name } of columns) {
      await queryRunner.query(
        `ALTER TABLE "${table_name}" ALTER COLUMN "${column_name}" TYPE character varying(11)`,
      );
    }
  }
}
