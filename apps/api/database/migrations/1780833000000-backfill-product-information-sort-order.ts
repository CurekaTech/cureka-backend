import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillProductInformationSortOrder1780833000000 implements MigrationInterface {
  name = 'BackfillProductInformationSortOrder1780833000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "products" AS p
      SET "product_information" = sub.sorted_items
      FROM (
        SELECT
          p2.id,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', elem->>'id',
                  'label', elem->>'label',
                  'description', elem->>'description',
                  'sortOrder', COALESCE(
                    NULLIF(elem->>'sortOrder', '')::int,
                    pil.sort_order,
                    ord::int - 1
                  )
                )
                ORDER BY COALESCE(
                  NULLIF(elem->>'sortOrder', '')::int,
                  pil.sort_order,
                  ord::int - 1
                ), elem->>'label'
              )
              FROM jsonb_array_elements(p2.product_information) WITH ORDINALITY AS t(elem, ord)
              LEFT JOIN "product_information_labels" pil
                ON pil.deleted_at IS NULL
                AND pil.name = trim(both from elem->>'label')
            ),
            '[]'::jsonb
          ) AS sorted_items
        FROM "products" p2
        WHERE jsonb_array_length(p2.product_information) > 0
      ) AS sub
      WHERE p.id = sub.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "products" AS p
      SET "product_information" = sub.items_without_sort_order
      FROM (
        SELECT
          p2.id,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', elem->>'id',
                  'label', elem->>'label',
                  'description', elem->>'description'
                )
                ORDER BY ord
              )
              FROM jsonb_array_elements(p2.product_information) WITH ORDINALITY AS t(elem, ord)
            ),
            '[]'::jsonb
          ) AS items_without_sort_order
        FROM "products" p2
        WHERE jsonb_array_length(p2.product_information) > 0
      ) AS sub
      WHERE p.id = sub.id
    `);
  }
}
