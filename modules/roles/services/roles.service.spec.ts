import { RolesService } from './roles.service';
import { RolesRepository } from '../repositories/roles.repository';
import { PermissionsRepository } from '../repositories/permissions.repository';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

describe('RolesService', () => {
  let service: RolesService;
  let rolesRepository: jest.Mocked<RolesRepository>;
  let permissionsRepository: jest.Mocked<PermissionsRepository>;

  beforeEach(() => {
    rolesRepository = {
      findAllPaginated: jest.fn(),
      existsBySlug: jest.fn(),
      existsByRefId: jest.fn(),
      create: jest.fn(),
      findByRefId: jest.fn(),
    } as unknown as jest.Mocked<RolesRepository>;

    permissionsRepository = {} as unknown as jest.Mocked<PermissionsRepository>;

    service = new RolesService(rolesRepository, permissionsRepository);
  });

  describe('findAll', () => {
    it('should retrieve paginated roles and sort their permissions in memory by module and action', async () => {
      const mockRoles = [
        {
          id: 'role-1',
          refId: 'ROL001',
          name: 'Moderator',
          slug: 'moderator',
          status: MasterStatus.ACTIVE,
          isSystem: false,
          permissions: [
            { id: 'p2', refId: 'PER002', code: 'orders.update', module: 'orders', action: 'update', name: 'Update Orders' },
            { id: 'p1', refId: 'PER001', code: 'orders.read', module: 'orders', action: 'read', name: 'Read Orders' },
            { id: 'p3', refId: 'PER003', code: 'users.read', module: 'users', action: 'read', name: 'Read Users' },
          ],
        },
      ] as any[];

      rolesRepository.findAllPaginated.mockResolvedValue({
        data: mockRoles,
        total: 1,
      });

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(rolesRepository.findAllPaginated).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        search: undefined,
        sortBy: undefined,
        sortOrder: 'DESC',
      });

      expect(result.data).toHaveLength(1);
      const mappedRole = result.data[0]!;
      expect(mappedRole.name).toBe('Moderator');

      // The permissions should be sorted in memory:
      // 1. orders.read (module: orders, action: read)
      // 2. orders.update (module: orders, action: update)
      // 3. users.read (module: users, action: read)
      expect(mappedRole.permissions).toHaveLength(3);
      expect(mappedRole.permissions[0]?.code).toBe('orders.read');
      expect(mappedRole.permissions[1]?.code).toBe('orders.update');
      expect(mappedRole.permissions[2]?.code).toBe('users.read');
    });
  });
});
