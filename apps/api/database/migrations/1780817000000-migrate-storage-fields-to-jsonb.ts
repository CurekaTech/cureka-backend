import { MigrationInterface, QueryRunner } from 'typeorm';

type ColumnMigration = {
  table: string;
  column: string;
  nullable: boolean;
  revertLength: number;
};

const STORAGE_COLUMNS: ColumnMigration[] = [
  { table: 'product_media', column: 'url', nullable: false, revertLength: 1000 },
  { table: 'categories', column: 'image', nullable: true, revertLength: 500 },
  { table: 'categories', column: 'banner', nullable: true, revertLength: 500 },
  { table: 'brands', column: 'logo', nullable: true, revertLength: 500 },
  { table: 'brands', column: 'banner', nullable: true, revertLength: 500 },
  { table: 'health_concerns', column: 'icon', nullable: true, revertLength: 500 },
  { table: 'health_concerns', column: 'banner', nullable: true, revertLength: 500 },
  { table: 'wellness_goals', column: 'image', nullable: true, revertLength: 500 },
  { table: 'banners', column: 'image_url', nullable: false, revertLength: 500 },
  { table: 'manufacturers', column: 'logo', nullable: true, revertLength: 500 },
  { table: 'packers', column: 'logo', nullable: true, revertLength: 500 },
  { table: 'importers', column: 'logo', nullable: true, revertLength: 500 },
  { table: 'users', column: 'profile_image_url', nullable: true, revertLength: 500 },
];

function getBucketName(): string {
  const driver = process.env.STORAGE_DRIVER ?? process.env.storage__driver ?? 'local';
  if (driver === 'gcs') {
    return process.env.GCS_BUCKET_NAME ?? process.env.storage__gcs__bucket ?? 'cureka-files-prod';
  }
  return 'local';
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function migrateColumnToJsonb(
  queryRunner: QueryRunner,
  { table, column, nullable }: ColumnMigration,
  bucketName: string,
): Promise<void> {
  const tempColumn = `${column}_jsonb_tmp`;
  const escapedBucket = escapeLiteral(bucketName);

  await queryRunner.query(`
    ALTER TABLE "${table}"
    ADD COLUMN "${tempColumn}" jsonb
  `);

  await queryRunner.query(`
    UPDATE "${table}" SET "${tempColumn}" = CASE
      WHEN "${column}" IS NULL OR TRIM("${column}") = '' THEN NULL
      WHEN TRIM("${column}") ~* '^https?://' AND TRIM("${column}") ~* 'storage\\.googleapis\\.com' THEN
        jsonb_build_object(
          'key', regexp_replace(
            regexp_replace(TRIM("${column}"), '.*storage\\.googleapis\\.com/[^/]+/', ''),
            '\\?.*$', ''
          ),
          'name', '${escapedBucket}'
        )
      ELSE jsonb_build_object(
        'key', regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(TRIM("${column}"), '^/uploads/', ''),
                  '^uploads/', ''
                ),
                '^/files/', ''
              ),
              '^files/', ''
            ),
            '^/+', ''
          ),
          '\\?.*$', ''
        ),
        'name', '${escapedBucket}'
      )
    END
  `);

  if (!nullable) {
    await queryRunner.query(`
      UPDATE "${table}"
      SET "${tempColumn}" = jsonb_build_object('key', TRIM("${column}"), 'name', '${escapedBucket}')
      WHERE "${tempColumn}" IS NULL
        AND "${column}" IS NOT NULL
        AND TRIM("${column}") <> ''
    `);
  }

  await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
  await queryRunner.query(
    `ALTER TABLE "${table}" RENAME COLUMN "${tempColumn}" TO "${column}"`,
  );

  if (!nullable) {
    await queryRunner.query(`
      ALTER TABLE "${table}"
      ALTER COLUMN "${column}" SET NOT NULL
    `);
  }
}

async function revertColumnToVarchar(
  queryRunner: QueryRunner,
  { table, column, nullable, revertLength }: ColumnMigration,
): Promise<void> {
  const tempColumn = `${column}_varchar_tmp`;

  await queryRunner.query(`
    ALTER TABLE "${table}"
    ADD COLUMN "${tempColumn}" character varying(${revertLength})
  `);

  await queryRunner.query(`
    UPDATE "${table}" SET "${tempColumn}" = CASE
      WHEN "${column}" IS NULL THEN NULL
      ELSE "${column}"->>'key'
    END
  `);

  await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
  await queryRunner.query(
    `ALTER TABLE "${table}" RENAME COLUMN "${tempColumn}" TO "${column}"`,
  );

  if (!nullable) {
    await queryRunner.query(`
      ALTER TABLE "${table}"
      ALTER COLUMN "${column}" SET NOT NULL
    `);
  }
}

export class MigrateStorageFieldsToJsonb1780817000000 implements MigrationInterface {
  name = 'MigrateStorageFieldsToJsonb1780817000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const bucketName = getBucketName();

    for (const column of STORAGE_COLUMNS) {
      await migrateColumnToJsonb(queryRunner, column, bucketName);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [...STORAGE_COLUMNS].reverse()) {
      await revertColumnToVarchar(queryRunner, column);
    }
  }
}
