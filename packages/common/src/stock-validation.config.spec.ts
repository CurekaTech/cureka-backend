import {
  isCurekaInventoryManaged,
  isStockInventoryManagementEnabled,
  isStockValidationEnabled,
  isVariantInStock,
} from './stock-validation.config';

describe('stock-validation.config (Cureka inventory)', () => {
  const original = process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'];

  afterEach(() => {
    if (original === undefined) delete process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'];
    else process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'] = original;
  });

  it('env off → not managed even when inCurekaInventory true', () => {
    process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'] = 'false';
    expect(isStockInventoryManagementEnabled()).toBe(false);
    expect(isCurekaInventoryManaged({ inCurekaInventory: true })).toBe(false);
    expect(isStockValidationEnabled({ inCurekaInventory: true })).toBe(false);
    expect(isVariantInStock(0, { inCurekaInventory: true })).toBe(true);
  });

  it('env on + inCurekaInventory false → not managed', () => {
    process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'] = 'true';
    expect(isCurekaInventoryManaged({ inCurekaInventory: false })).toBe(false);
    expect(isVariantInStock(0, { inCurekaInventory: false })).toBe(true);
  });

  it('env on + inCurekaInventory true → managed', () => {
    process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'] = 'true';
    expect(isCurekaInventoryManaged({ inCurekaInventory: true })).toBe(true);
    expect(isStockValidationEnabled({ inCurekaInventory: true })).toBe(true);
    expect(isVariantInStock(0, { inCurekaInventory: true })).toBe(false);
    expect(isVariantInStock(3, { inCurekaInventory: true })).toBe(true);
  });

  it('treats a missing variant as not Cureka-managed', () => {
    process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'] = 'true';
    expect(isCurekaInventoryManaged(null)).toBe(false);
    expect(isVariantInStock(0, null)).toBe(false);
    expect(isStockValidationEnabled(null)).toBe(true);
  });

  it('coerces QueryBuilder/driver string booleans for inCurekaInventory', () => {
    process.env['STOCK_INVENTORY_MANAGEMENT_ENABLED'] = 'true';
    expect(isCurekaInventoryManaged({ inCurekaInventory: 'true' as unknown as boolean })).toBe(
      true,
    );
    expect(isCurekaInventoryManaged({ inCurekaInventory: 't' as unknown as boolean })).toBe(true);
    expect(isCurekaInventoryManaged({ inCurekaInventory: 1 as unknown as boolean })).toBe(true);
    expect(isCurekaInventoryManaged({ inCurekaInventory: 'false' as unknown as boolean })).toBe(
      false,
    );
  });
});
