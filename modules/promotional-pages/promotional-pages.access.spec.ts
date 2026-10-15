import 'reflect-metadata';
import { MENU_HIERARCHY } from '@modules/auth/services/admin-auth.service';
import { PERMISSIONS_KEY } from '@modules/roles/decorators/permissions.decorator';
import { ADMIN_PERMISSION_SEEDS } from '@modules/roles/constants/admin-permissions.constants';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { PermissionsRepository } from '@modules/roles/repositories/permissions.repository';
import { PermissionsService } from '@modules/roles/services/permissions.service';
import { PROMOTIONAL_PAGE_PERMISSIONS } from './constants/promotional-page-permissions.constants';
import { AdminPromotionalPagesController } from './controllers/admin-promotional-pages.controller';

const permissionsOf = (handler: unknown): string[] =>
  Reflect.getMetadata(PERMISSIONS_KEY, handler as object) ?? [];

const flatten = (items: typeof MENU_HIERARCHY): typeof MENU_HIERARCHY =>
  items.flatMap((item) => [item, ...flatten(item.subItems ?? [])]);

describe('Promotional landing page RBAC', () => {
  it('requires read to list and open a page', () => {
    expect(permissionsOf(AdminPromotionalPagesController.prototype.findAll)).toEqual([
      PROMOTIONAL_PAGE_PERMISSIONS.READ,
    ]);
    expect(permissionsOf(AdminPromotionalPagesController.prototype.findOne)).toEqual([
      PROMOTIONAL_PAGE_PERMISSIONS.READ,
    ]);
  });

  it('requires create, update, publish, delete, and preview on the matching actions', () => {
    expect(permissionsOf(AdminPromotionalPagesController.prototype.create)).toEqual([
      PROMOTIONAL_PAGE_PERMISSIONS.CREATE,
    ]);
    expect(permissionsOf(AdminPromotionalPagesController.prototype.update)).toEqual([
      PROMOTIONAL_PAGE_PERMISSIONS.UPDATE,
    ]);
    expect(permissionsOf(AdminPromotionalPagesController.prototype.replaceSections)).toEqual([
      PROMOTIONAL_PAGE_PERMISSIONS.UPDATE,
    ]);
    expect(permissionsOf(AdminPromotionalPagesController.prototype.updateStatus)).toEqual([
      PROMOTIONAL_PAGE_PERMISSIONS.STATUS,
    ]);
    expect(permissionsOf(AdminPromotionalPagesController.prototype.remove)).toEqual([
      PROMOTIONAL_PAGE_PERMISSIONS.DELETE,
    ]);
    expect(permissionsOf(AdminPromotionalPagesController.prototype.preview)).toEqual([
      PROMOTIONAL_PAGE_PERMISSIONS.PREVIEW,
    ]);
  });

  it('declares every enforced permission in the seed catalogue', () => {
    const seeded = new Set(ADMIN_PERMISSION_SEEDS.map((permission) => permission.code));
    for (const code of Object.values(PROMOTIONAL_PAGE_PERMISSIONS) as string[]) {
      expect(seeded.has(code)).toBe(true);
    }
  });

  it('places the module under Marketing and hides it without view permission', () => {
    const marketing = MENU_HIERARCHY.find((item) => item.key === 'marketing');
    const entry = flatten(MENU_HIERARCHY).find((item) => item.key === 'marketing-promotional-pages');

    expect(marketing?.name).toBe('Marketing');
    expect(entry?.name).toBe('Promotional Landing Pages');
    expect(entry?.href).toBe('/marketing/promotional-pages');
    expect(entry?.requiredPermissions).toEqual([PROMOTIONAL_PAGE_PERMISSIONS.READ]);

    const canSee = (codes: string[]): boolean =>
      (entry?.requiredPermissions ?? []).some((code) => codes.includes(code));

    expect(canSee([])).toBe(false);
    expect(canSee([PROMOTIONAL_PAGE_PERMISSIONS.CREATE])).toBe(false);
    expect(canSee([PROMOTIONAL_PAGE_PERMISSIONS.READ])).toBe(true);
    expect(
      canSee([
        PROMOTIONAL_PAGE_PERMISSIONS.READ,
        PROMOTIONAL_PAGE_PERMISSIONS.CREATE,
        PROMOTIONAL_PAGE_PERMISSIONS.UPDATE,
        PROMOTIONAL_PAGE_PERMISSIONS.STATUS,
      ]),
    ).toBe(true);
  });

  it('exposes the module in the permission tree used by role assignment', async () => {
    const rows = Object.values(PROMOTIONAL_PAGE_PERMISSIONS).map((code, index) => ({
      id: String(index),
      refId: `PER0000041${index}`,
      code,
      name: code,
      module: 'promotional_landing_pages',
      action: code.split('.')[1],
      status: MasterStatus.ACTIVE,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const permissions = new PermissionsService(
      {
        findAll: async () => rows,
      } as unknown as PermissionsRepository,
      { recordWrite: jest.fn() } as never,
    );

    const tree = await permissions.findGroupedByModule();
    const marketing = tree.find((item: { key: string }) => item.key === 'marketing');
    const entry = marketing.subItems.find(
      (item: { key: string }) => item.key === 'marketing-promotional-pages',
    );

    expect(entry.permissions.map((permission: { code: string }) => permission.code).sort()).toEqual(
      [...Object.values(PROMOTIONAL_PAGE_PERMISSIONS)].sort(),
    );
  });
});
