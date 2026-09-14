import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersService } from '@modules/admin-users/services/admin-users.service';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

describe('AdminAuthService - Menu Filtering', () => {
  let service: AdminAuthService;
  let adminUsersService: jest.Mocked<AdminUsersService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(() => {
    adminUsersService = {
      findEntityById: jest.fn(),
    } as unknown as jest.Mocked<AdminUsersService>;

    jwtService = {} as unknown as jest.Mocked<JwtService>;

    service = new AdminAuthService(adminUsersService, jwtService);
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
      expect(keys).toContain('subscriptions');
      expect(keys).toContain('cms');
      expect(keys).toContain('role-management');
      expect(keys).toContain('audit-logs');
      expect(keys).toContain('settings');
    });

    it('should filter menu items strictly based on user permissions', async () => {
      const mockEntity = {
        id: 'admin-id',
        role: 'admin',
        isActive: true,
        roleRecord: {
          permissions: [
            { code: 'orders.read', status: MasterStatus.ACTIVE },
            { code: 'settings.read', status: MasterStatus.ACTIVE },
            { code: 'roles.read', status: MasterStatus.ACTIVE },
          ],
        },
      } as any;

      adminUsersService.findEntityById.mockResolvedValue(mockEntity);

      const menu = await service.getMenuForUser('admin-id');

      // Masters still appears because "Country of Origin" has no requiredPermissions.
      // Subscriptions must stay hidden without user_product_subscriptions.read.
      const keys = menu.map((m) => m.key);
      expect(keys).toContain('dashboard'); // Dashboard has no requiredPermissions, always visible
      expect(keys).toContain('orders'); // accessible via orders.read
      expect(keys).toContain('role-management'); // accessible via roles.read
      expect(keys).toContain('settings'); // accessible via settings.read

      expect(keys).not.toContain('products');
      expect(keys).not.toContain('subscriptions');
      expect(keys).not.toContain('cms');
      expect(keys).not.toContain('audit-logs');
    });
  });
});
