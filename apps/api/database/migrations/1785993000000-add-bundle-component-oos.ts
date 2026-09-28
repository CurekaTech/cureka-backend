import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill uses the default STOCK_INVENTORY_MANAGEMENT_ENABLED=true rule
 * (admin OOS flag, plus stock > 0 when in_cureka_inventory). Live recalculation
 * after deploy follows the current env flag.
 */
const BACKFILL_BUNDLE_COMPONENT_OOS = `
WITH child_state AS (
  SELECT
    pb.parent_product_id,
    child.id AS child_id,
    child.ref_id,
    COALESCE(child.name, 'Unknown product') AS child_name,
    (
      child.id IS NULL
      OR child.deleted_at IS NOT NULL
      OR NOT EXISTS (
        SELECT 1
        FROM product_variants pv
        WHERE pv.product_id = child.id
          AND pv.deleted_at IS NULL
          AND pv.status = 'active'
          AND COALESCE(pv.out_of_stock, false) = false
          AND (
            COALESCE(pv.in_cureka_inventory, false) = false
            OR COALESCE(pv.stock, 0) > 0
          )
      )
      OR (
        child.product_type = 'bundle'
        AND COALESCE(child.bundle_component_oos, false) = true
      )
    ) AS component_oos,
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'sku', pv.sku,
            'name', COALESCE(pv.display_name, child.name)
          )
          ORDER BY pv.sku
        ),
        '[]'::jsonb
      )
      FROM product_variants pv
      WHERE pv.product_id = child.id
        AND pv.deleted_at IS NULL
        AND pv.status = 'active'
        AND NOT (
          COALESCE(pv.out_of_stock, false) = false
          AND (
            COALESCE(pv.in_cureka_inventory, false) = false
            OR COALESCE(pv.stock, 0) > 0
          )
        )
    ) AS unsellable_variants
  FROM product_bundles pb
  INNER JOIN products parent
    ON parent.id = pb.parent_product_id
    AND parent.product_type = 'bundle'
    AND parent.deleted_at IS NULL
  LEFT JOIN products child ON child.id = pb.child_product_id
)
UPDATE products p
SET
  bundle_component_oos = src.is_oos,
  bundle_oos_components = CASE WHEN src.is_oos THEN src.components ELSE NULL END
FROM (
  SELECT
    parent_product_id AS id,
    BOOL_OR(component_oos) AS is_oos,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'refId', COALESCE(ref_id, ''),
          'name', child_name,
          'variants', CASE
            WHEN jsonb_array_length(unsellable_variants) > 0 THEN unsellable_variants
            ELSE (
              SELECT COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'sku', pv.sku,
                    'name', COALESCE(pv.display_name, child_name)
                  )
                  ORDER BY pv.sku
                ),
                '[]'::jsonb
              )
              FROM product_variants pv
              WHERE pv.product_id = child_id
                AND pv.deleted_at IS NULL
                AND pv.status = 'active'
            )
          END
        )
        ORDER BY child_name, ref_id
      ) FILTER (WHERE component_oos),
      '[]'::jsonb
    ) AS components
  FROM child_state
  GROUP BY parent_product_id
) src
WHERE p.id = src.id
  AND (
    p.bundle_component_oos IS DISTINCT FROM src.is_oos
    OR p.bundle_oos_components IS DISTINCT FROM CASE
      WHEN src.is_oos THEN src.components
      ELSE NULL
    END
  )
RETURNING p.id
`;

export class AddBundleComponentOos1785993000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "bundle_component_oos" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "bundle_oos_components" jsonb
    `);

    for (let wave = 0; wave < 15; wave += 1) {
      const updated: unknown[] = await queryRunner.query(BACKFILL_BUNDLE_COMPONENT_OOS);
      if (!Array.isArray(updated) || updated.length === 0) break;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "bundle_oos_components"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "bundle_component_oos"`,
    );
  }
}
