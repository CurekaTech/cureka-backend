import { BUNDLE_COMPONENT_OOS_REASON } from '../utils/bundle-availability.util';
import { BundleAvailabilityService } from './bundle-availability.service';

describe('BundleAvailabilityService', () => {
  const query = jest.fn();
  const emitAsync = jest.fn().mockResolvedValue([]);
  const enqueueBundleOosSafe = jest.fn();
  const service = new BundleAvailabilityService(
    { manager: { query } } as never,
    { emitAsync } as never,
    { enqueueBundleOosSafe } as never,
  );

  const header = (
    id: string,
    refId: string,
    name: string,
    sku: string,
    bundleComponentOos = false,
    bundleOosComponents: unknown = null,
  ) => ({
    id,
    refId,
    name,
    sku,
    bundleComponentOos,
    bundleOosComponents,
  });

  const component = (bundleId: string, child: Record<string, unknown>) => ({
    bundleId,
    quantity: 1,
    childId: child.childId,
    childRefId: child.childRefId,
    childName: child.childName,
    childType: 'simple',
    childBundleComponentOos: false,
    childDeletedAt: null,
    variantSku: child.variantSku,
    variantName: child.variantName,
    variantStock: child.variantStock ?? 5,
    variantOutOfStock: child.variantOutOfStock ?? false,
    variantInCurekaInventory: false,
    variantStatus: 'active',
    variantDeletedAt: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('bundle-availability:targets')) {
        return [{ id: 'bundle-a' }, { id: 'bundle-b' }];
      }
      if (sql.includes('bundle-availability:headers')) {
        return [
          header('bundle-a', 'BNDA', 'Immunity Care Bundle', 'BND-12345'),
          header('bundle-b', 'BNDB', 'Second Bundle', 'BND-999'),
        ];
      }
      if (sql.includes('bundle-availability:components')) {
        return [
          component('bundle-a', {
            childId: 'child-vit',
            childRefId: 'VITC',
            childName: 'Vitamin C 500mg',
            variantSku: 'VIT-C-001',
            variantName: 'Vitamin C 500mg',
            variantOutOfStock: true,
            variantStock: 0,
          }),
          component('bundle-a', {
            childId: 'child-zinc',
            childRefId: 'ZINC',
            childName: 'Zinc Tablets',
            variantSku: 'ZIN-002',
            variantName: 'Zinc Tablets',
            variantOutOfStock: true,
            variantStock: 0,
          }),
          component('bundle-b', {
            childId: 'child-vit',
            childRefId: 'VITC',
            childName: 'Vitamin C 500mg',
            variantSku: 'VIT-C-001',
            variantName: 'Vitamin C 500mg',
            variantOutOfStock: true,
            variantStock: 0,
          }),
        ];
      }
      if (sql.includes('bundle-availability:parents')) return [];
      return [];
    });
  });

  it('updates every parent bundle and emails each changed OOS set once', async () => {
    await service.recalculateForProducts(['child-vit']);

    const emails = enqueueBundleOosSafe.mock.calls[0][0] as Array<{
      bundleSku: string;
      reason: string;
      components: Array<{ name: string; variants: Array<{ sku: string }> }>;
    }>;
    expect(emails).toHaveLength(2);
    expect(emails.map((email) => email.bundleSku).sort()).toEqual(['BND-12345', 'BND-999']);
    const immunity = emails.find((email) => email.bundleSku === 'BND-12345');
    expect(immunity?.reason).toBe(BUNDLE_COMPONENT_OOS_REASON);
    expect(immunity?.components.map((item) => item.variants[0]?.sku).sort()).toEqual([
      'VIT-C-001',
      'ZIN-002',
    ]);

    const persistCall = query.mock.calls.find((call) =>
      String(call[0]).includes('bundle-availability:persist'),
    );
    const persisted = JSON.parse(persistCall[1][0]) as Array<{ id: string; oos: boolean }>;
    expect(persisted.map((row) => row.id).sort()).toEqual(['bundle-a', 'bundle-b']);
    expect(persisted.every((row) => row.oos)).toBe(true);
    expect(emitAsync).toHaveBeenCalledTimes(2);
  });

  it('does not email or write when the OOS component set is unchanged', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('bundle-availability:targets')) return [{ id: 'bundle-a' }];
      if (sql.includes('bundle-availability:headers')) {
        return [
          header('bundle-a', 'BNDA', 'Immunity Care Bundle', 'BND-12345', true, [
            {
              refId: 'VITC',
              name: 'Vitamin C 500mg',
              variants: [{ sku: 'VIT-C-001', name: 'Vitamin C 500mg' }],
            },
          ]),
        ];
      }
      if (sql.includes('bundle-availability:components')) {
        return [
          component('bundle-a', {
            childId: 'child-vit',
            childRefId: 'VITC',
            childName: 'Vitamin C 500mg',
            variantSku: 'VIT-C-001',
            variantName: 'Vitamin C 500mg',
            variantOutOfStock: true,
          }),
        ];
      }
      return [];
    });

    await service.recalculateForProducts(['child-vit']);

    expect(enqueueBundleOosSafe).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some((call) => String(call[0]).includes('bundle-availability:persist')),
    ).toBe(false);
    expect(emitAsync).not.toHaveBeenCalled();
  });

  it('clears the dependency flag without an email when every component is available', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('bundle-availability:targets')) return [{ id: 'bundle-a' }];
      if (sql.includes('bundle-availability:headers')) {
        return [
          header('bundle-a', 'BNDA', 'Immunity Care Bundle', 'BND-12345', true, [
            {
              refId: 'VITC',
              name: 'Vitamin C 500mg',
              variants: [{ sku: 'VIT-C-001', name: 'Vitamin C 500mg' }],
            },
          ]),
        ];
      }
      if (sql.includes('bundle-availability:components')) {
        return [
          component('bundle-a', {
            childId: 'child-vit',
            childRefId: 'VITC',
            childName: 'Vitamin C 500mg',
            variantSku: 'VIT-C-001',
            variantName: 'Vitamin C 500mg',
            variantOutOfStock: false,
            variantStock: 4,
          }),
        ];
      }
      if (sql.includes('bundle-availability:parents')) return [];
      return [];
    });

    await service.recalculateForProducts(['child-vit']);

    expect(enqueueBundleOosSafe).not.toHaveBeenCalled();
    const persistCall = query.mock.calls.find((call) =>
      String(call[0]).includes('bundle-availability:persist'),
    );
    expect(JSON.parse(persistCall[1][0])).toEqual([
      { id: 'bundle-a', oos: false, components: null },
    ]);
  });
});
