import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'brands', column: 'video_alt_text' },
  { table: 'brands', column: 'secondary_video_alt_text' },
  { table: 'expert_talk_items', column: 'video_alt_text' },
  { table: 'watch_and_shop_items', column: 'video_alt_text' },
];

export class AddVideoAltTextToManagedContent1786009000000 implements MigrationInterface {
  name = 'AddVideoAltTextToManagedContent1786009000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column } of COLUMNS) {
      if (await queryRunner.hasColumn(table, column)) continue;
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: column,
          type: 'varchar',
          length: '250',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column } of [...COLUMNS].reverse()) {
      if (await queryRunner.hasColumn(table, column)) {
        await queryRunner.dropColumn(table, column);
      }
    }
  }
}