import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillProductInformationLabelRefId1785970000000
  implements MigrationInterface
{
  name = 'BackfillProductInformationLabelRefId1785970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET statement_timeout = 0`);

    await queryRunner.query(`
      UPDATE products AS p
      SET product_information = enriched.items
      FROM (
        SELECT
          src.id,
          COALESCE(
            jsonb_agg(
              CASE
                WHEN pil.ref_id IS NOT NULL
                  THEN jsonb_set(
                    src_item.item,
                    '{labelRefId}',
                    to_jsonb(pil.ref_id),
                    true
                  )
                ELSE src_item.item
              END
              ORDER BY src_item.ordinality
            ),
            '[]'::jsonb
          ) AS items
        FROM products src
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(src.product_information, '[]'::jsonb)
        ) WITH ORDINALITY AS src_item(item, ordinality)
        LEFT JOIN product_information_labels pil
          ON pil.deleted_at IS NULL
          AND lower(btrim(pil.name)) = lower(btrim(src_item.item->>'label'))
        WHERE src.product_information IS NOT NULL
          AND jsonb_typeof(src.product_information) = 'array'
        GROUP BY src.id
      ) AS enriched
      WHERE p.id = enriched.id
        AND p.product_information IS DISTINCT FROM enriched.items
    `);

    await queryRunner.query(`
      UPDATE product_variants AS v
      SET product_information = enriched.items
      FROM (
        SELECT
          src.id,
          COALESCE(
            jsonb_agg(
              CASE
                WHEN pil.ref_id IS NOT NULL
                  THEN jsonb_set(
                    src_item.item,
                    '{labelRefId}',
                    to_jsonb(pil.ref_id),
                    true
                  )
                ELSE src_item.item
              END
              ORDER BY src_item.ordinality
            ),
            '[]'::jsonb
          ) AS items
        FROM product_variants src
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(src.product_information, '[]'::jsonb)
        ) WITH ORDINALITY AS src_item(item, ordinality)
        LEFT JOIN product_information_labels pil
          ON pil.deleted_at IS NULL
          AND lower(btrim(pil.name)) = lower(btrim(src_item.item->>'label'))
        WHERE src.product_information IS NOT NULL
          AND jsonb_typeof(src.product_information) = 'array'
        GROUP BY src.id
      ) AS enriched
      WHERE v.id = enriched.id
        AND v.product_information IS DISTINCT FROM enriched.items
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Non-destructive: labelRefId can remain on JSON after rollback.
  }
}
