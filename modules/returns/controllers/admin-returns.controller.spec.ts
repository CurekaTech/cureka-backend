import { MENU_HIERARCHY } from '@modules/auth/services/admin-auth.service';
import { PERMISSIONS_KEY } from '@modules/roles/decorators/permissions.decorator';
import { ADMIN_PERMISSION_SEEDS } from '@modules/roles/constants/admin-permissions.constants';
import { RETURN_PERMISSIONS } from '../constants/return-permissions.constants';
import { AdminReturnPoliciesController } from './admin-return-policies.controller';
import { AdminReturnsController } from './admin-returns.controller';

const permissionsOf = (handler: unknown): string[] =>
  Reflect.getMetadata(PERMISSIONS_KEY, handler as object) ?? [];

describe('AdminReturnsController RBAC', () => {
  it('requires returns.read to list and view returns', () => {
    expect(permissionsOf(AdminReturnsController.prototype.list)).toEqual([
      RETURN_PERMISSIONS.READ,
    ]);
    expect(permissionsOf(AdminReturnsController.prototype.getOne)).toEqual([
      RETURN_PERMISSIONS.READ,
    ]);
  });

  it('requires the dedicated approve and reject permissions', () => {
    expect(permissionsOf(AdminReturnsController.prototype.approve)).toEqual([
      RETURN_PERMISSIONS.APPROVE,
    ]);
    expect(permissionsOf(AdminReturnsController.prototype.reject)).toEqual([
      RETURN_PERMISSIONS.REJECT,
    ]);
  });

  it('gates the operational transitions behind returns.status', () => {
    for (const handler of [
      AdminReturnsController.prototype.schedulePickup,
      AdminReturnsController.prototype.updatePickupStatus,
      AdminReturnsController.prototype.receive,
      AdminReturnsController.prototype.submitQc,
      AdminReturnsController.prototype.complete,
    ]) {
      expect(permissionsOf(handler)).toEqual([RETURN_PERMISSIONS.STATUS]);
    }
  });

  it('gates refund creation behind the approve permission', () => {
    expect(permissionsOf(AdminReturnsController.prototype.createRefund)).toEqual([
      RETURN_PERMISSIONS.APPROVE,
    ]);
  });

  it('gates admin-initiated returns behind returns.create', () => {
    expect(permissionsOf(AdminReturnsController.prototype.create)).toEqual([
      RETURN_PERMISSIONS.CREATE,
    ]);
  });

  it('separates policy permissions from return permissions', () => {
    expect(permissionsOf(AdminReturnPoliciesController.prototype.getProductPolicy)).toEqual([
      RETURN_PERMISSIONS.POLICY_READ,
    ]);
    expect(permissionsOf(AdminReturnPoliciesController.prototype.updateProductPolicy)).toEqual([
      RETURN_PERMISSIONS.POLICY_UPDATE,
    ]);
  });

  it('declares every return permission it enforces in the seed catalogue', () => {
    const seeded = new Set(ADMIN_PERMISSION_SEEDS.map((permission) => permission.code));
    for (const code of Object.values(RETURN_PERMISSIONS)) {
      expect(seeded.has(code)).toBe(true);
    }
  });
});

describe('Returns sidebar', () => {
  const flatten = (items: typeof MENU_HIERARCHY): typeof MENU_HIERARCHY =>
    items.flatMap((item) => [item, ...flatten(item.subItems ?? [])]);

  it('exposes a returns entry gated by returns.read', () => {
    const entry = flatten(MENU_HIERARCHY).find((item) => item.key === 'orders-return-requests');

    expect(entry).toBeDefined();
    expect(entry?.requiredPermissions).toEqual([RETURN_PERMISSIONS.READ]);
  });

  it('exposes create-return behind returns.create', () => {
    const entry = flatten(MENU_HIERARCHY).find((item) => item.key === 'returns-create');
    expect(entry?.href).toBe('/returns/create');
    expect(entry?.requiredPermissions).toEqual([RETURN_PERMISSIONS.CREATE]);
  });

  it('exposes product return policies behind return_policies.read', () => {
    const entry = flatten(MENU_HIERARCHY).find((item) => item.key === 'products-return-policies');
    expect(entry?.href).toBe('/products/return-policies');
    expect(entry?.requiredPermissions).toEqual([RETURN_PERMISSIONS.POLICY_READ]);
  });

  it('gates every returns menu entry behind a real return permission', () => {
    const returnPermissions = new Set<string>(Object.values(RETURN_PERMISSIONS));
    const entries = flatten(MENU_HIERARCHY).filter((item) => item.key.startsWith('returns-'));

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.requiredPermissions?.every((code) => returnPermissions.has(code))).toBe(true);
    }
  });
});
