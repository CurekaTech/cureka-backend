import { ProductType } from '../enums/product-type.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { BUNDLE_COMPONENT_OOS_REASON } from './bundle-availability.util';
import {
  buildBundleAvailability,
  BundleChildInput,
  BundleComponentVariantInput,
  isBundleComponentAvailable,
  listUnavailableBundleComponents,
} from './bundle-availability.util';

const variant = (
  overrides: Partial<BundleComponentVariantInput> = {},
): BundleComponentVariantInput => ({
  sku: 'SKU-1',
  name: 'Variant',
  stock: 5,
  outOfStock: false,
  inCurekaInventory: false,
  status: VariantStatus.ACTIVE,
  deletedAt: null,
  ...overrides,
});

const child = (overrides: Partial<BundleChildInput> = {}): BundleChildInput => ({
  refId: 'CHILD1',
  name: 'Child',
  productType: ProductType.SIMPLE,
  bundleComponentOos: false,
  deleted: false,
  quantity: 1,
  variants: [variant()],
  ...overrides,
});

describe('bundle availability', () => {
  const originalEnv = process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED;
    } else {
      process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = originalEnv;
    }
  });

  it('is INS when every component is available', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    const availability = buildBundleAvailability(
      [variant({ sku: 'BND-12345' })],
      [
        child({ refId: 'A', name: 'Vitamin C', variants: [variant({ sku: 'VIT-C-001' })] }),
        child({ refId: 'B', name: 'Zinc', variants: [variant({ sku: 'ZIN-002' })] }),
      ],
    );

    expect(availability.status).toBe('INS');
    expect(availability.reason).toBeNull();
    expect(availability.oosComponents).toEqual([]);
    expect(availability.sku).toBe('BND-12345');
  });

  it('is OOS when one component is OOS and lists that component', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    const availability = buildBundleAvailability(
      [variant({ sku: 'BND-12345', inCurekaInventory: true, stock: 3 })],
      [
        child({
          refId: 'A',
          name: 'Vitamin C 500mg',
          variants: [variant({ sku: 'VIT-C-001', name: 'Vitamin C 500mg', outOfStock: true })],
        }),
        child({
          refId: 'C',
          name: 'Multivitamin',
          variants: [variant({ sku: 'MULTI-003', name: 'Multivitamin' })],
        }),
      ],
    );

    expect(availability.status).toBe('OOS');
    expect(availability.reason).toBe(BUNDLE_COMPONENT_OOS_REASON);
    expect(availability.inCurekaInventory).toBe(true);
    expect(availability.oosComponents).toEqual([
      {
        refId: 'A',
        name: 'Vitamin C 500mg',
        variants: [{ sku: 'VIT-C-001', name: 'Vitamin C 500mg' }],
      },
    ]);
    expect(availability.components.map((item) => item.status)).toEqual(['OOS', 'INS']);
  });

  it('lists every OOS component when several are unavailable', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'false';
    const components = listUnavailableBundleComponents([
      child({
        refId: 'B',
        name: 'Zinc Tablets',
        variants: [variant({ sku: 'ZIN-002', outOfStock: true })],
      }),
      child({
        refId: 'A',
        name: 'Vitamin C 500mg',
        variants: [variant({ sku: 'VIT-C-001', outOfStock: true })],
      }),
      child({ refId: 'C', name: 'Multivitamin' }),
    ]);

    expect(components.map((item) => item.refId)).toEqual(['A', 'B']);
  });

  it('stays OOS when one component recovers and another is still OOS', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    const availability = buildBundleAvailability(
      [variant({ sku: 'BND-1', outOfStock: false })],
      [
        child({ refId: 'A', name: 'Product A' }),
        child({
          refId: 'C',
          name: 'Product C',
          variants: [variant({ sku: 'C-1', outOfStock: true })],
        }),
      ],
    );

    expect(availability.status).toBe('OOS');
    expect(availability.oosComponents.map((item) => item.refId)).toEqual(['C']);
  });

  it('returns INS when every previously OOS component is available again', () => {
    const availability = buildBundleAvailability(
      [variant({ sku: 'BND-1' })],
      [child({ refId: 'A' }), child({ refId: 'B', name: 'B' }), child({ refId: 'C', name: 'C' })],
    );
    expect(availability.status).toBe('INS');
  });

  it('stays OOS when components are available but the bundle variant is manually OOS', () => {
    const availability = buildBundleAvailability(
      [variant({ sku: 'BND-1', outOfStock: true, stock: 8 })],
      [child()],
    );
    expect(availability.status).toBe('OOS');
    expect(availability.reason).toBeNull();
    expect(availability.oosComponents).toEqual([]);
  });

  it('treats a Cureka-managed component with no stock as OOS when inventory management is on', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    expect(
      isBundleComponentAvailable(
        child({
          variants: [variant({ stock: 0, inCurekaInventory: true, outOfStock: false })],
        }),
      ),
    ).toBe(false);
  });

  it('ignores stock for a component that is not in Cureka inventory', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    expect(
      isBundleComponentAvailable(
        child({
          variants: [variant({ stock: 0, inCurekaInventory: false, outOfStock: false })],
        }),
      ),
    ).toBe(true);
  });

  it('ignores stock for every component when inventory management is off', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'false';
    expect(
      isBundleComponentAvailable(
        child({
          variants: [variant({ stock: 0, inCurekaInventory: true, outOfStock: false })],
        }),
      ),
    ).toBe(true);
    expect(
      isBundleComponentAvailable(
        child({
          variants: [variant({ stock: 4, inCurekaInventory: true, outOfStock: true })],
        }),
      ),
    ).toBe(false);
  });

  it('keeps a variable component available when another variant is still sellable', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    expect(
      isBundleComponentAvailable(
        child({
          productType: ProductType.VARIABLE,
          variants: [
            variant({ sku: 'PACK-1', outOfStock: true }),
            variant({ sku: 'PACK-2', outOfStock: false, stock: 2, inCurekaInventory: true }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it('treats a nested bundle as unavailable when its dependency flag is set', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    const components = listUnavailableBundleComponents([
      child({
        refId: 'INNER',
        name: 'Inner bundle',
        productType: ProductType.BUNDLE,
        bundleComponentOos: true,
        variants: [variant({ sku: 'INNER-SKU', outOfStock: false })],
      }),
    ]);

    expect(components).toEqual([
      {
        refId: 'INNER',
        name: 'Inner bundle',
        variants: [{ sku: 'INNER-SKU', name: 'Variant' }],
      },
    ]);
  });
});
