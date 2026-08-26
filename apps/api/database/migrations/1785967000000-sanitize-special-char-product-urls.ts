import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replace legacy inch/degree marks (and their percent-encoded forms) in product
 * slugs and product_page_url with SEO-safe tokens: `-inches`, `-degree`.
 *
 * After deploy, run a Typesense product reindex so search links pick up the new paths.
 */
export class SanitizeSpecialCharProductUrls1785967000000 implements MigrationInterface {
  name = 'SanitizeSpecialCharProductUrls1785967000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "product_variants"
      SET
        "product_page_url" = regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      "product_page_url",
                      '%e2%80%b3',
                      '-inches',
                      'gi'
                    ),
                    '%e2%80%b2',
                    '-inches',
                    'gi'
                  ),
                  '%cb%9a',
                  '-degree',
                  'gi'
                ),
                '%c2%b0',
                '-degree',
                'gi'
              ),
              '″',
              '-inches',
              'g'
            ),
            '˚',
            '-degree',
            'g'
          ),
          '-{2,}',
          '-',
          'g'
        )
      WHERE "product_page_url" IS NOT NULL
        AND (
          "product_page_url" ~* '%e2%80%b3|%e2%80%b2|%cb%9a|%c2%b0'
          OR "product_page_url" LIKE '%″%'
          OR "product_page_url" LIKE '%˚%'
        )
    `);

    await queryRunner.query(`
      UPDATE "product_variants"
      SET
        "slug" = regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        "slug",
                        '%e2%80%b3',
                        '-inches',
                        'gi'
                      ),
                      '%e2%80%b2',
                      '-inches',
                      'gi'
                    ),
                    '%cb%9a',
                    '-degree',
                    'gi'
                  ),
                  '%c2%b0',
                  '-degree',
                  'gi'
                ),
                'e280b3',
                '-inches',
                'gi'
              ),
              'e280b2',
              '-inches',
              'gi'
            ),
            'cb9a',
            '-degree',
            'gi'
          ),
          '-{2,}',
          '-',
          'g'
        )
      WHERE "slug" ~* '%e2%80%b3|%e2%80%b2|%cb%9a|%c2%b0|e280b3|e280b2|cb9a'
         OR "slug" LIKE '%″%'
         OR "slug" LIKE '%˚%'
    `);

    await queryRunner.query(`
      UPDATE "products"
      SET
        "slug" = regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        "slug",
                        '%e2%80%b3',
                        '-inches',
                        'gi'
                      ),
                      '%e2%80%b2',
                      '-inches',
                      'gi'
                    ),
                    '%cb%9a',
                    '-degree',
                    'gi'
                  ),
                  '%c2%b0',
                  '-degree',
                  'gi'
                ),
                'e280b3',
                '-inches',
                'gi'
              ),
              'e280b2',
              '-inches',
              'gi'
            ),
            'cb9a',
            '-degree',
            'gi'
          ),
          '-{2,}',
          '-',
          'g'
        )
      WHERE "slug" ~* '%e2%80%b3|%e2%80%b2|%cb%9a|%c2%b0|e280b3|e280b2|cb9a'
         OR "slug" LIKE '%″%'
         OR "slug" LIKE '%˚%'
    `);
  }

  public async down(): Promise<void> {
    // Irreversible data cleanup — old special-character URLs are preserved via frontend 301s.
  }
}
