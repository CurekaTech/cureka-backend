import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AdminUsersService } from './admin-users.service';
import { AdminUserRole } from '../enums/admin-user-role.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

jest.mock('@packages/common', () => {
  const actual = jest.requireActual('@packages/common');
  return {
    ...actual,
    hashPassword: jest.fn(async () => 'hashed-password'),
    generateUniqueRefId: jest.fn(async () => 'ADM2026000001'),
  };
});

describe('AdminUsersService.create', () => {
  const adminUsersRepository = {
    findByNormalizedEmailIncludingDeleted: jest.fn(),
    restoreAndUpdate: jest.fn(),
    create: jest.fn(),
    existsByRefId: jest.fn(),
  };
  const rolesRepository = {
    findByRefId: jest.fn(),
  };

  const service = new AdminUsersService(
    adminUsersRepository as never,
    rolesRepository as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const dto = {
    fullName: 'Et nulla qui volupta',
    email: 'care@cureka.com',
    password: 'Pa$$w0rd!',
    roleRefId: 'TES2026302063',
  };

  const roleRecord = {
    id: 'role-1',
    slug: AdminUserRole.ADMIN,
    status: MasterStatus.ACTIVE,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    rolesRepository.findByRefId.mockResolvedValue(roleRecord);
  });

  it('rejects an active admin with the same email using 409 instead of a database unique error', async () => {
    adminUsersRepository.findByNormalizedEmailIncludingDeleted.mockResolvedValue({
      id: 'existing',
      email: 'care@cureka.com',
      deletedAt: null,
    });

    await expect(
      service.create(dto, 'creator@cureka.com', AdminUserRole.SUPER_ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(adminUsersRepository.create).not.toHaveBeenCalled();
  });

  it('restores a soft-deleted admin so the email can be reused after it disappeared from the list', async () => {
    adminUsersRepository.findByNormalizedEmailIncludingDeleted.mockResolvedValue({
      id: 'deleted-id',
      email: 'care@cureka.com',
      deletedAt: new Date('2026-01-01'),
    });
    adminUsersRepository.restoreAndUpdate.mockResolvedValue({
      id: 'deleted-id',
      refId: 'OLDREF',
      fullName: dto.fullName,
      email: dto.email,
      role: AdminUserRole.ADMIN,
      roleId: roleRecord.id,
      isActive: true,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2026-11-12'),
    });

    const result = await service.create(dto, 'creator@cureka.com', AdminUserRole.SUPER_ADMIN);

    expect(adminUsersRepository.restoreAndUpdate).toHaveBeenCalledWith(
      'deleted-id',
      expect.objectContaining({
        email: 'care@cureka.com',
        password: 'hashed-password',
        isActive: true,
        role: AdminUserRole.ADMIN,
        roleId: 'role-1',
      }),
    );
    expect(adminUsersRepository.create).not.toHaveBeenCalled();
    expect(result.email).toBe('care@cureka.com');
    expect(result.isActive).toBe(true);
  });

  it('maps a unique-email database error to 409 Conflict', async () => {
    adminUsersRepository.findByNormalizedEmailIncludingDeleted.mockResolvedValue(null);
    const driverError = {
      code: '23505',
      constraint: 'IDX_admin_users_email',
      detail: 'Key (email)=(care@cureka.com) already exists.',
    };
    adminUsersRepository.create.mockRejectedValue(
      new QueryFailedError('INSERT', [], driverError as never),
    );

    await expect(
      service.create(dto, 'creator@cureka.com', AdminUserRole.SUPER_ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
