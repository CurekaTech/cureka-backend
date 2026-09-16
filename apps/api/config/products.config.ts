import { registerAs } from '@nestjs/config';

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

/**
 * Product-module feature flags.
 *
 * ALLOW_DUPLICATE_SKU_FOR_BUNDLES — temporary window for recreating Combo packs
 * as real `bundle` products while reusing SKUs that still exist on old simples.
 * Set back to false (and restore the unique SKU index) after migration.
 */
export const productsConfig = registerAs('products', () => ({
  allowDuplicateSkuForBundles: asBool(process.env['ALLOW_DUPLICATE_SKU_FOR_BUNDLES'], false),
}));
