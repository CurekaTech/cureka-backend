import {
  hasRequiredPermissions,
  isRequiredPermissionSatisfied,
} from './implied-read-permission.util';

describe('implied read permission', () => {
  it('lets an order creator search customers without users.read', () => {
    const owned = new Set(['orders.create']);
    expect(isRequiredPermissionSatisfied('users.read', owned)).toBe(true);
  });

  it('lets an order editor load customers and the product picker', () => {
    const owned = new Set(['orders.update']);
    expect(isRequiredPermissionSatisfied('users.read', owned)).toBe(true);
    expect(isRequiredPermissionSatisfied('payment-request.read', owned)).toBe(true);
    expect(isRequiredPermissionSatisfied('products.read', owned)).toBe(true);
  });

  it('lets create or update on the same module read that module', () => {
    expect(isRequiredPermissionSatisfied('products.read', new Set(['products.create']))).toBe(
      true,
    );
    expect(isRequiredPermissionSatisfied('brands.read', new Set(['brands.update']))).toBe(true);
  });

  it('lets any create or update role read master lookup data', () => {
    const owned = new Set(['products.create']);
    expect(isRequiredPermissionSatisfied('brands.read', owned)).toBe(true);
    expect(isRequiredPermissionSatisfied('categories.read', owned)).toBe(true);
    expect(isRequiredPermissionSatisfied('units.read', owned)).toBe(true);
  });

  it('does not turn create into update, status, or delete', () => {
    const owned = new Set(['products.create', 'orders.create']);
    expect(isRequiredPermissionSatisfied('products.update', owned)).toBe(false);
    expect(isRequiredPermissionSatisfied('products.status', owned)).toBe(false);
    expect(isRequiredPermissionSatisfied('products.delete', owned)).toBe(false);
    expect(isRequiredPermissionSatisfied('users.update', owned)).toBe(false);
    expect(isRequiredPermissionSatisfied('users.delete', owned)).toBe(false);
  });

  it('does not open customer, order, or audit lists from an unrelated write', () => {
    const owned = new Set(['banners.update']);
    expect(isRequiredPermissionSatisfied('users.read', owned)).toBe(false);
    expect(isRequiredPermissionSatisfied('orders.read', owned)).toBe(false);
    expect(isRequiredPermissionSatisfied('audit_logs.read', owned)).toBe(false);
    expect(isRequiredPermissionSatisfied('admin_users.read', owned)).toBe(false);
    expect(isRequiredPermissionSatisfied('brands.read', owned)).toBe(true);
  });

  it('still requires every permission in all-mode except implied reads', () => {
    const owned = new Set(['orders.create']);
    expect(hasRequiredPermissions(['users.read'], owned, 'all')).toBe(true);
    expect(hasRequiredPermissions(['users.read', 'users.delete'], owned, 'all')).toBe(false);
  });
});
