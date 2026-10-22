import { MENU_HIERARCHY, type MenuItem } from '@modules/auth/constants/admin-menu.constants';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { PermissionsRepository } from '../repositories/permissions.repository';
import { PermissionsService } from '../services/permissions.service';
import { MENU_SCOPED_ROWS } from '../../../apps/api/database/migrations/1786016000000-add-menu-scoped-permissions';
import {
  MENU_PERMISSION_SCOPES,
  SCOPED_PERMISSION_DEFINITIONS,
  expandScopedPermissionCodes,
  scopedMenuRequiredPermissions,
} from './menu-permission-scopes.constants';

const flatten = (items: MenuItem[]): MenuItem[] =>
  items.flatMap((item) => [item, ...flatten(item.subItems ?? [])]);

describe('menu permission scopes', () => {
  it('matches the migration that inserts the row codes', () => {
    expect(
      MENU_SCOPED_ROWS.map(({ menuKey, base, label, actions }) => ({
        menuKey,
        base,
        label,
        actions: [...actions].sort(),
      })),
    ).toEqual(
      MENU_PERMISSION_SCOPES.map(({ menuKey, base, label, actions }) => ({
        menuKey,
        base,
        label,
        actions: [...actions].sort(),
      })),
    );
  });

  it('only scopes rows that exist in the sidebar menu', () => {
    const menuKeys = new Set(flatten(MENU_HIERARCHY).map((item) => item.key));
    for (const scope of MENU_PERMISSION_SCOPES) {
      expect(menuKeys.has(scope.menuKey)).toBe(true);
    }
  });

  it('gives every row a distinct code', () => {
    const codes = SCOPED_PERMISSION_DEFINITIONS.map((definition) => definition.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('lets a row code satisfy the shared API code for the same action only', () => {
    const owned = expandScopedPermissionCodes(['products_list_approved.read']);
    expect(owned.has('products.read')).toBe(true);
    expect(owned.has('products.update')).toBe(false);
    expect(owned.has('products_list_rejected.read')).toBe(false);
  });

  it('builds the role matrix from the sidebar menu with one code set per row', async () => {
    const rows = [
      ...SCOPED_PERMISSION_DEFINITIONS,
      { code: 'products.read', module: 'products', action: 'read' },
      { code: 'brands.read', module: 'brands', action: 'read' },
    ].map((permission, index) => ({
      id: `id-${index}`,
      refId: `PER${String(index).padStart(8, '0')}`,
      name: permission.code,
      code: permission.code,
      module: permission.module,
      action: permission.action,
      status: MasterStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const service = new PermissionsService(
      { findAll: async () => rows } as unknown as PermissionsRepository,
      { recordWrite: jest.fn() } as never,
    );

    const tree = await service.findGroupedByModule();
    const productList = tree
      .find((node) => node.key === 'products')
      ?.subItems?.find((node) => node.key === 'products-list-parent');

    expect(productList?.permissions).toBeUndefined();
    expect(productList?.subItems?.map((node) => node.key)).toEqual([
      'products-list-all',
      'products-list-approved',
      'products-list-pending',
      'products-list-rejected',
    ]);
    const active = productList?.subItems?.find((node) => node.key === 'products-list-approved');
    expect(active?.permissions?.map((permission) => permission.code).sort()).toEqual([
      'products_list_approved.approve',
      'products_list_approved.read',
      'products_list_approved.status',
      'products_list_approved.update',
    ]);

    const bulkUpload = tree
      .find((node) => node.key === 'products')
      ?.subItems?.find((node) => node.key === 'products-bulk-upload');
    expect(bulkUpload?.subItems?.map((node) => node.key)).toEqual([
      'products-bulk-upload-products',
      'products-bulk-price-update',
      'products-bulk-cod-update',
      'products-bulk-return-update',
    ]);

    const allCodes = JSON.stringify(tree);
    expect(allCodes).not.toContain('"products.read"');
  });

  it('shows a tab only when its own read code is granted', () => {
    expect(scopedMenuRequiredPermissions('products-list-rejected')).toEqual([
      'products_list_rejected.read',
    ]);
    expect(scopedMenuRequiredPermissions('products-bulk-price-update')).toEqual([
      'products_bulk_price_update.update',
    ]);
    expect(scopedMenuRequiredPermissions('masters-brands')).toBeUndefined();
  });
});
