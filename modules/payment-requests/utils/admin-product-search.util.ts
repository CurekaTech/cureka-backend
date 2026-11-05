import { ProductType } from '@modules/product/enums/product-type.enum';
import { deriveBundleCodAvailable } from '@modules/product/utils/bundle-cod.util';

export type AdminProductSearchVariantResult = {
  variantId: string;
  sku: string;
  mrp: string;
  sellingPrice: string;
  stock: number;
  attributeLabel: string | null;
  /** Website COD flag for this line. Bundles use every child variant. */
  codAvailable: boolean;
};

export type AdminProductSearchProductResult = {
  productId: string;
  productName: string;
  /** Website product COD flag. Bundles are derived from child variants. */
  codAvailable: boolean;
  variants: AdminProductSearchVariantResult[];
};

export type AdminProductSearchVariantInput = {
  variantId: string;
  productId: string;
  productName: string;
  productType?: string | null;
  productCodAvailable: boolean;
  sku: string;
  mrp: string;
  sellingPrice: string;
  stock: number;
  attributeLabel: string | null;
  variantCodAvailable: boolean;
};

export const resolveAdminSearchCodAvailable = (
  productType: string | null | undefined,
  productCodAvailable: boolean,
  bundleCodByProductId: Map<string, boolean>,
  productId: string,
): boolean => {
  if (productType === ProductType.BUNDLE) {
    return bundleCodByProductId.get(productId) === true;
  }
  // Storefront badges use the product-level admin toggle.
  return productCodAvailable === true;
};

/**
 * Website Non-COD is the product toggle. Variant rows inherit that same flag so
 * admin search matches storefront, except bundles which are derived.
 */
export const groupAdminProductSearchVariants = (
  rows: AdminProductSearchVariantInput[],
  bundleCodByProductId: Map<string, boolean> = new Map(),
): AdminProductSearchProductResult[] => {
  const productMap = new Map<string, AdminProductSearchProductResult>();
  const result: AdminProductSearchProductResult[] = [];

  for (const row of rows) {
    const codAvailable = resolveAdminSearchCodAvailable(
      row.productType,
      row.productCodAvailable,
      bundleCodByProductId,
      row.productId,
    );

    if (!productMap.has(row.productId)) {
      const entry: AdminProductSearchProductResult = {
        productId: row.productId,
        productName: row.productName,
        codAvailable,
        variants: [],
      };
      productMap.set(row.productId, entry);
      result.push(entry);
    }

    const product = productMap.get(row.productId)!;
    product.codAvailable = product.codAvailable && codAvailable;
    product.variants.push({
      variantId: row.variantId,
      sku: row.sku,
      mrp: row.mrp,
      sellingPrice: row.sellingPrice,
      stock: row.stock,
      attributeLabel: row.attributeLabel,
      codAvailable,
    });
  }

  return result;
};

export const buildBundleCodMap = (
  bundleProductIds: string[],
  rows: Array<{ parentProductId: string; childVariant?: { codAvailable?: boolean | null } | null }>,
): Map<string, boolean> => {
  const byParent = new Map<string, Array<{ codAvailable?: boolean | null }>>();
  for (const row of rows) {
    const list = byParent.get(row.parentProductId) ?? [];
    list.push(row.childVariant ?? { codAvailable: false });
    byParent.set(row.parentProductId, list);
  }
  const bundleCod = new Map<string, boolean>();
  for (const productId of bundleProductIds) {
    bundleCod.set(productId, deriveBundleCodAvailable(byParent.get(productId) ?? []));
  }
  return bundleCod;
};
