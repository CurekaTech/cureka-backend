/**
 * One-time identity snapshot for bundle order lines that have no bundle_components.
 *
 * Writes productId, variantId, sku, productName, variantName, and quantityPerBundle
 * from the current product_bundles rows. Skips a line when any child cannot be
 * identified. Never overwrites an existing snapshot. Never writes cod_available.
 *
 * SAFE BY DEFAULT — dry-run unless --apply is passed.
 *
 * Usage:
 *   npm run orders:backfill-bundle-components
 *   npm run orders:backfill-bundle-components -- --apply
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';

interface OrderLine {
  id: string;
  product_id: string;
  order_number: string | null;
  sku: string;
}

interface BundleChild {
  parent_product_id: string;
  child_product_id: string;
  child_variant_id: string | null;
  quantity: number;
  sku: string | null;
  display_name: string | null;
  child_name: string | null;
}

interface SnapshotComponent {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantityPerBundle: number;
}

const apply = process.argv.includes('--apply');

const main = async (): Promise<void> => {
  await AppDataSource.initialize();
  try {
    const lines = (await AppDataSource.query(`
      SELECT oi.id, oi.product_id, oi.sku, o.order_number
      FROM order_items oi
      INNER JOIN products p ON p.id = oi.product_id
      LEFT JOIN orders o ON o.id = oi.order_id
      WHERE p.product_type = 'bundle'
        AND oi.bundle_components IS NULL
      ORDER BY oi.created_at ASC
    `)) as OrderLine[];

    const parentIds = [...new Set(lines.map((line) => line.product_id))];
    const children = parentIds.length
      ? ((await AppDataSource.query(
          `
            SELECT
              pb.parent_product_id,
              pb.child_product_id,
              pb.child_variant_id,
              pb.quantity,
              pv.sku,
              pv.display_name,
              cp.name AS child_name
            FROM product_bundles pb
            LEFT JOIN product_variants pv ON pv.id = pb.child_variant_id
            LEFT JOIN products cp ON cp.id = pb.child_product_id
            WHERE pb.parent_product_id = ANY($1::uuid[])
          `,
          [parentIds],
        )) as BundleChild[])
      : [];

    const byParent = new Map<string, BundleChild[]>();
    for (const child of children) {
      const list = byParent.get(child.parent_product_id) ?? [];
      list.push(child);
      byParent.set(child.parent_product_id, list);
    }

    let written = 0;
    const skipped: string[] = [];

    for (const line of lines) {
      const rows = byParent.get(line.product_id) ?? [];
      const snapshot = toSnapshot(rows);
      if (!snapshot) {
        skipped.push(`${line.order_number ?? line.id} ${line.sku}`);
        continue;
      }
      if (apply) {
        await AppDataSource.query(
          `
            UPDATE order_items
            SET bundle_components = $2::jsonb, updated_at = NOW()
            WHERE id = $1 AND bundle_components IS NULL
          `,
          [line.id, JSON.stringify(snapshot)],
        );
      }
      written += 1;
    }

    console.log(
      `${apply ? 'Applied' : 'Dry run'}: ${written} bundle line(s) ${apply ? 'updated' : 'would be updated'}, ${skipped.length} skipped.`,
    );
    if (skipped.length) {
      console.log('Skipped because a child product or variant could not be identified:');
      for (const row of skipped) {
        console.log(`  ${row}`);
      }
    }
  } finally {
    await AppDataSource.destroy();
  }
};

const toSnapshot = (rows: BundleChild[]): SnapshotComponent[] | null => {
  if (rows.length === 0) {
    return null;
  }
  const components: SnapshotComponent[] = [];
  for (const row of rows) {
    if (!row.child_variant_id || !row.sku || !row.child_name) {
      return null;
    }
    components.push({
      productId: row.child_product_id,
      variantId: row.child_variant_id,
      sku: row.sku,
      productName: row.child_name,
      variantName: row.display_name,
      quantityPerBundle: Number(row.quantity),
    });
  }
  return components;
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
