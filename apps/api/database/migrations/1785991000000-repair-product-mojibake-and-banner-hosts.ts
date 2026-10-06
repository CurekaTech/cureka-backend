import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repair UTF-8 product text that was stored as Windows-1252 mojibake,
 * and rewrite banner CTAs that still point at cureka.techbv.in / .com.
 */
export class RepairProductMojibakeAndBannerHosts1785991000000 implements MigrationInterface {
  name = 'RepairProductMojibakeAndBannerHosts1785991000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION repair_utf8_mojibake(input text) RETURNS text
      LANGUAGE plpgsql
      IMMUTABLE
      AS $$
      DECLARE
        repaired text;
      BEGIN
        IF input IS NULL OR input !~ '[ÃÂâ]' THEN
          RETURN input;
        END IF;
        BEGIN
          repaired := convert_from(convert_to(input, 'WIN1252'), 'UTF8');
        EXCEPTION WHEN OTHERS THEN
          RETURN input;
        END;
        IF repaired IS NULL THEN
          RETURN input;
        END IF;
        RETURN repaired;
      END;
      $$;
    `);

    await queryRunner.query(`
      UPDATE products
      SET
        name = repair_utf8_mojibake(name),
        description = repair_utf8_mojibake(description),
        components = repair_utf8_mojibake(components),
        meta_title = repair_utf8_mojibake(meta_title),
        meta_description = repair_utf8_mojibake(meta_description)
      WHERE name ~ '[ÃÂâ]'
         OR description ~ '[ÃÂâ]'
         OR components ~ '[ÃÂâ]'
         OR meta_title ~ '[ÃÂâ]'
         OR meta_description ~ '[ÃÂâ]'
    `);

    await queryRunner.query(`
      UPDATE product_variants
      SET display_name = repair_utf8_mojibake(display_name)
      WHERE display_name ~ '[ÃÂâ]'
    `);

    await queryRunner.query(`
      UPDATE banners
      SET external_url = CASE
        WHEN regexp_replace(external_url, '^https?://(www\\.)?cureka\\.techbv\\.(in|com)', '') = '' THEN '/'
        ELSE regexp_replace(external_url, '^https?://(www\\.)?cureka\\.techbv\\.(in|com)', '')
      END
      WHERE external_url ~* '^https?://(www\\.)?cureka\\.techbv\\.(in|com)'
    `);

    await queryRunner.query(`
      UPDATE home_sections
      SET banners = replace(
        replace(
          replace(
            replace(banners::text, 'https://www.cureka.techbv.in', ''),
            'https://cureka.techbv.in',
            ''
          ),
          'https://www.cureka.techbv.com',
          ''
        ),
        'https://cureka.techbv.com',
        ''
      )::jsonb
      WHERE banners::text ~* 'cureka\\.techbv\\.(in|com)'
    `);

    await queryRunner.query(`DROP FUNCTION IF EXISTS repair_utf8_mojibake(text)`);
  }

  public async down(): Promise<void> {
    // Text repairs are not reversible.
  }
};
