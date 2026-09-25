import { ProductEntity } from '../entities/product.entity';
import { VariantStatus } from '../enums/variant-status.enum';
import {
  hasSellablePublicVariant,
  isPublicVariantSellable,
  sellableVariantAvailabilitySql,
} from './public-variant-availability.util';

describe('public variant availability', () => {
  const originalEnv = process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED;
    } else {
      process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = originalEnv;
    }
  });

  it('treats an admin OOS flag as not sellable even when stock remains', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'false';
    expect(
      isPublicVariantSellable({ outOfStock: true, stock: 10, inCurekaInventory: false }),
    ).toBe(false);
  });

  it('keeps a non-Cureka variant sellable when stock is zero', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    expect(
      isPublicVariantSellable({ outOfStock: false, stock: 0, inCurekaInventory: false }),
    ).toBe(true);
  });

  it('treats a Cureka-managed variant with no stock as not sellable', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    expect(
      isPublicVariantSellable({ outOfStock: false, stock: 0, inCurekaInventory: true }),
    ).toBe(false);
    expect(
      isPublicVariantSellable({ outOfStock: false, stock: 2, inCurekaInventory: true }),
    ).toBe(true);
  });

  it('treats a product as in stock when any active variant is sellable', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    const product = {
      variants: [
        {
          status: VariantStatus.ACTIVE,
          deletedAt: null,
          outOfStock: true,
          stock: 4,
          inCurekaInventory: false,
        },
        {
          status: VariantStatus.ACTIVE,
          deletedAt: null,
          outOfStock: false,
          stock: 2,
          inCurekaInventory: true,
        },
      ],
    } as unknown as ProductEntity;

    expect(hasSellablePublicVariant(product)).toBe(true);
  });

  it('treats a product as out of stock when every active variant is unsellable', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    const product = {
      variants: [
        {
          status: VariantStatus.ACTIVE,
          deletedAt: null,
          outOfStock: true,
          stock: 0,
          inCurekaInventory: true,
        },
      ],
    } as unknown as ProductEntity;

    expect(hasSellablePublicVariant(product)).toBe(false);
  });

  it('builds an INS-before-OOS SQL predicate that includes the stock gate when enabled', () => {
    process.env.STOCK_INVENTORY_MANAGEMENT_ENABLED = 'true';
    const sql = sellableVariantAvailabilitySql('pv_avail');
    expect(sql).toContain('pv_avail.out_of_stock');
    expect(sql).toContain('pv_avail.in_cureka_inventory');
    expect(sql).toContain('pv_avail.stock');
  });
});
