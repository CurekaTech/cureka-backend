import { ProductType } from '../enums/product-type.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import {
  IBundleAvailability,
  IBundleAvailabilityComponent,
  IBundleOosComponent,
} from '../interfaces/bundle-availability.interface';
import { isPublicVariantSellable } from './public-variant-availability.util';

export const BUNDLE_COMPONENT_OOS_REASON =
  'This bundle has been marked Out of Stock because one or more products/variants included in the bundle are currently Out of Stock.';

export interface BundleComponentVariantInput {
  sku: string;
  name: string | null;
  stock: number;
  outOfStock: boolean;
  inCurekaInventory: boolean;
  status: VariantStatus | string;
  deletedAt?: Date | null;
}

export interface BundleChildInput {
  refId: string;
  name: string;
  productType: ProductType | string;
  bundleComponentOos: boolean;
  deleted: boolean;
  quantity: number;
  variants: BundleComponentVariantInput[];
}

export interface BundleOwnVariantInput {
  sku: string;
  stock: number;
  outOfStock: boolean;
  inCurekaInventory: boolean;
  status: VariantStatus | string;
  deletedAt?: Date | null;
}

const isActiveVariant = (variant: {
  status: VariantStatus | string;
  deletedAt?: Date | null;
}): boolean => !variant.deletedAt && variant.status === VariantStatus.ACTIVE;

const variantLabel = (variant: BundleComponentVariantInput, productName: string): string =>
  variant.name?.trim() || productName;

export const bundleOosComponentKey = (
  components: readonly IBundleOosComponent[] | null | undefined,
): string =>
  (components ?? [])
    .map(
      (component) =>
        `${component.refId}:${[...component.variants.map((variant) => variant.sku)].sort().join(',')}`,
    )
    .sort()
    .join('|');

export const isBundleComponentAvailable = (child: BundleChildInput): boolean => {
  if (child.deleted || !child.refId) return false;
  if (child.productType === ProductType.BUNDLE && child.bundleComponentOos) return false;
  return child.variants.some(
    (variant) => isActiveVariant(variant) && isPublicVariantSellable(variant),
  );
};

const activeVariants = (child: BundleChildInput): BundleComponentVariantInput[] =>
  child.variants.filter((variant) => isActiveVariant(variant));

export const listUnavailableBundleComponents = (
  children: readonly BundleChildInput[],
): IBundleOosComponent[] =>
  children
    .filter((child) => !isBundleComponentAvailable(child))
    .map((child) => {
      const active = activeVariants(child);
      const unsellable = active.filter((variant) => !isPublicVariantSellable(variant));
      const listed = unsellable.length ? unsellable : active;
      return {
        refId: child.refId,
        name: child.name,
        variants: listed
          .map((variant) => ({
            sku: variant.sku,
            name: variantLabel(variant, child.name),
          }))
          .sort((left, right) => left.sku.localeCompare(right.sku)),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.refId.localeCompare(right.refId));

const mapComponent = (child: BundleChildInput): IBundleAvailabilityComponent => {
  const active = activeVariants(child);
  const available = isBundleComponentAvailable(child);
  return {
    refId: child.refId,
    name: child.name,
    quantity: child.quantity,
    status: available ? 'INS' : 'OOS',
    inCurekaInventory: active.length > 0 && active.every((variant) => variant.inCurekaInventory),
    variants: active.map((variant) => ({
      sku: variant.sku,
      name: variant.name,
      status: isPublicVariantSellable(variant) ? 'INS' : 'OOS',
      inCurekaInventory: variant.inCurekaInventory,
    })),
  };
};

const ownVariantSellable = (variants: readonly BundleOwnVariantInput[]): boolean =>
  variants.some((variant) => isActiveVariant(variant) && isPublicVariantSellable(variant));

export const buildBundleAvailability = (
  ownVariants: readonly BundleOwnVariantInput[],
  children: readonly BundleChildInput[],
): IBundleAvailability => {
  const pricing =
    ownVariants.find((variant) => isActiveVariant(variant)) ?? ownVariants[0] ?? null;
  const oosComponents = listUnavailableBundleComponents(children);
  const status =
    ownVariantSellable(ownVariants) && oosComponents.length === 0 ? 'INS' : 'OOS';

  return {
    status,
    sku: pricing?.sku ?? null,
    inCurekaInventory: pricing?.inCurekaInventory ?? false,
    reason: oosComponents.length ? BUNDLE_COMPONENT_OOS_REASON : null,
    oosComponents,
    components: children.map(mapComponent),
  };
};
