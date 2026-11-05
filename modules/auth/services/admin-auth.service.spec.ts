import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersService } from '@modules/admin-users/services/admin-users.service';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

describe('AdminAuthService - Menu Filtering', () => {
  let service: AdminAuthService;
  let adminUsersService: jest.Mocked<AdminUsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configGet: jest.Mock;

  beforeEach(() => {
    adminUsersService = {
      findEntityById: jest.fn(),
    } as unknown as jest.Mocked<AdminUsersService>;

    jwtService = {} as unknown as jest.Mocked<JwtService>;
    configGet = jest.fn();

    service = new AdminAuthService(
      adminUsersService,
      jwtService,
      { persistCritical: jest.fn() } as never,
      { get: configGet } as never,
      { allocate: jest.fn(), revoke: jest.fn(), isActiveForAdmin: jest.fn() } as never,
    );
  });

  describe('getMenuForUser', () => {
    it('should throw UnauthorizedException if admin user is not found or inactive', async () => {
      adminUsersService.findEntityById.mockResolvedValue(null);

      await expect(service.getMenuForUser('invalid-id')).rejects.toThrow(UnauthorizedException);
    });

    it('should return all menu items if user has super_admin role (wildcard permission)', async () => {
      const mockEntity = {
        id: 'super-admin-id',
        role: 'super_admin',
        isActive: true,
        roleRecord: null,
      } as any;

      adminUsersService.findEntityById.mockResolvedValue(mockEntity);

      const menu = await service.getMenuForUser('super-admin-id');

      // Verify that all core submenus are present for super_admin
      const keys = menu.map((m) => m.key);
      expect(keys).toContain('dashboard');
      expect(keys).toContain('masters');
      expect(keys).toContain('products');
      expect(keys).toContain('orders');
      expect(keys).not.toContain('subscriptions');
      expect(keys).toContain('cms');
      expect(keys).toContain('role-management');
      expect(keys).toContain('audit-logs');
      expect(keys).toContain('settings');
      const masters = menu.find((item) => item.key === 'masters');
      expect(masters?.subItems?.map((item) => item.key)).not.toContain(
        'masters-subscription-frequency',
      );
    });

    it('hides the doctors module when DOCTOR_CONSULTATION_MODULE_ENABLED is false', async () => {
      configGet.mockImplementation(
        (key: string) => key === 'subscriptions.moduleEnabled',
      );
      adminUsersService.findEntityById.mockResolvedValue({
        id: 'super-admin-id',
        role: 'super_admin',
        isActive: true,
        roleRecord: null,
      } as any);

      const menu = await service.getMenuForUser('super-admin-id');
      expect(menu.map((item) => item.key)).not.toContain('doctors');
    });

    it('hides the doctors module while HIDE_DOCTORS_FROM_ADMIN_MENU is true', async () => {
      configGet.mockImplementation(
        (key: string) =>
          key === 'subscriptions.moduleEnabled' ||
          key === 'doctorConsultation.moduleEnabled',
      );
      adminUsersService.findEntityById.mockResolvedValue({
        id: 'super-admin-id',
        role: 'super_admin',
        isActive: true,
        roleRecord: null,
      } as any);

      const menu = await service.getMenuForUser('super-admin-id');
      expect(menu.map((item) => item.key)).not.toContain('doctors');
    });

    it('includes the subscription module when SUBSCRIPTIONS_MODULE_ENABLED=true', async () => {
      configGet.mockImplementation(
        (key: string) => key === 'subscriptions.moduleEnabled',
      );
      adminUsersService.findEntityById.mockResolvedValue({
        id: 'super-admin-id',
        role: 'super_admin',
        isActive: true,
        roleRecord: null,
      } as any);

      const menu = await service.getMenuForUser('super-admin-id');
      const keys = menu.map((item) => item.key);
      expect(keys).toContain('subscriptions');
      const masters = menu.find((item) => item.key === 'masters');
      expect(masters?.subItems?.map((item) => item.key)).toContain(
        'masters-subscription-frequency',
      );
    });

    it('should filter menu items strictly based on user permissions', async () => {
      const mockEntity = {
        id: 'admin-id',
        role: 'admin',
        isActive: true,
        roleRecord: {
          permissions: [
            { code: 'orders_list_all.read', status: MasterStatus.ACTIVE },
            { code: 'cart_charges_view.read', status: MasterStatus.ACTIVE },
            { code: 'roles.read', status: MasterStatus.ACTIVE },
          ],
        },
      } as any;

      adminUsersService.findEntityById.mockResolvedValue(mockEntity);

      const menu = await service.getMenuForUser('admin-id');

      // Subscriptions must stay hidden without user_product_subscriptions.read.
      const keys = menu.map((m) => m.key);
      expect(keys).toContain('dashboard'); // Dashboard has no requiredPermissions, always visible
      expect(keys).toContain('orders'); // accessible via orders_list_all.read
      expect(keys).toContain('role-management'); // accessible via roles.read
      expect(keys).toContain('settings'); // accessible via cart_charges_view.read

      expect(keys).not.toContain('products');
      expect(keys).not.toContain('subscriptions');
      expect(keys).not.toContain('cms');
      expect(keys).not.toContain('audit-logs');

      const orderKeys = menu
        .find((item) => item.key === 'orders')
        ?.subItems?.map((item) => item.key);
      expect(orderKeys).toEqual(['orders-list-all']);
      const settingKeys = menu
        .find((item) => item.key === 'settings')
        ?.subItems?.map((item) => item.key);
      expect(settingKeys).toEqual(['cart-charges-view']);
    });
  });
});
