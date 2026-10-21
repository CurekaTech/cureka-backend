import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { comparePasswords } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { SUPER_ADMIN_SESSION_LIMIT_MESSAGE } from '../utils/super-admin-session.util';
import { AdminAuthService } from './admin-auth.service';

jest.mock('@packages/common', () => {
  const actual = jest.requireActual('@packages/common');
  return { ...actual, comparePasswords: jest.fn() };
});

describe('AdminAuthService super admin session cap', () => {
  const compare = comparePasswords as jest.MockedFunction<typeof comparePasswords>;
  const adminUsersService = {
    findByEmailWithPassword: jest.fn(),
    findByNormalizedEmailWithPassword: jest.fn(),
    findEntityById: jest.fn(),
    recordLogin: jest.fn(),
  };
  const jwtService = { sign: jest.fn() };
  const auditService = { persistCritical: jest.fn() };
  const configService = { get: jest.fn() };
  const sessions = { allocate: jest.fn(), revoke: jest.fn(), isActiveForAdmin: jest.fn() };

  const service = new AdminAuthService(
    adminUsersService as never,
    jwtService as never,
    auditService as never,
    configService as never,
    sessions as never,
    { isPromotionalOffersEnabled: jest.fn().mockResolvedValue(false) } as never,
  );

  const superAdmin = {
    id: 'admin-1',
    refId: 'ADM1',
    fullName: 'Super Admin',
    email: 'superadmin@cureka.com',
    role: AdminUserRole.SUPER_ADMIN,
    roleId: 'role-1',
    isActive: true,
    roleRecord: null,
    password: 'hashed',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    compare.mockResolvedValue(true);
    configService.get.mockReturnValue('15m');
    jwtService.sign.mockReturnValue('signed-token');
    sessions.allocate.mockResolvedValue('session-1');
    sessions.revoke.mockResolvedValue(true);
    adminUsersService.findEntityById.mockResolvedValue(superAdmin);
    adminUsersService.findByNormalizedEmailWithPassword.mockResolvedValue(superAdmin);
    adminUsersService.findByEmailWithPassword.mockResolvedValue({
      ...superAdmin,
      id: 'admin-2',
      email: 'admin@cureka.com',
      role: AdminUserRole.ADMIN,
    });
  });

  it('issues a session-bound token when the account is under the cap', async () => {
    const before = Date.now();
    const result = await service.login({ email: '  SuperAdmin@Cureka.com ', password: 'secret' });
    const expiresAt = sessions.allocate.mock.calls[0][1] as Date;
    expect(adminUsersService.findByNormalizedEmailWithPassword).toHaveBeenCalledWith(
      '  SuperAdmin@Cureka.com ',
    );
    expect(adminUsersService.findByEmailWithPassword).not.toHaveBeenCalled();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 1000);
    expect(jwtService.sign).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1' }));
    expect(result.accessToken).toBe('signed-token');
    expect(adminUsersService.recordLogin).toHaveBeenCalledWith('admin-1');
  });

  it('rejects the login without a token when three sessions are active', async () => {
    sessions.allocate.mockRejectedValue(new BadRequestException(SUPER_ADMIN_SESSION_LIMIT_MESSAGE));
    await expect(service.login({ email: 'superadmin@cureka.com', password: 'secret' })).rejects.toThrow(
      SUPER_ADMIN_SESSION_LIMIT_MESSAGE,
    );
    expect(jwtService.sign).not.toHaveBeenCalled();
    expect(adminUsersService.recordLogin).not.toHaveBeenCalled();
    expect(auditService.persistCritical).not.toHaveBeenCalled();
  });

  it('revokes the new session when JWT signing fails', async () => {
    jwtService.sign.mockImplementation(() => {
      throw new Error('sign failed');
    });
    await expect(service.login({ email: 'superadmin@cureka.com', password: 'secret' })).rejects.toThrow(
      'sign failed',
    );
    expect(sessions.revoke).toHaveBeenCalledWith('session-1', 'admin-1');
    expect(adminUsersService.recordLogin).not.toHaveBeenCalled();
  });

  it('keeps the existing failure path for a wrong password or inactive account', async () => {
    compare.mockResolvedValueOnce(false);
    await expect(service.login({ email: 'superadmin@cureka.com', password: 'nope' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    adminUsersService.findByNormalizedEmailWithPassword.mockResolvedValue({ ...superAdmin, isActive: false });
    compare.mockResolvedValueOnce(true);
    await expect(service.login({ email: 'superadmin@cureka.com', password: 'secret' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.allocate).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
    expect(adminUsersService.recordLogin).not.toHaveBeenCalled();
    expect(auditService.persistCritical).toHaveBeenCalledTimes(2);
  });

  it('does not cap any other admin', async () => {
    adminUsersService.findEntityById.mockResolvedValue({
      ...superAdmin,
      id: 'admin-2',
      email: 'admin@cureka.com',
      role: AdminUserRole.ADMIN,
    });
    await service.login({ email: 'admin@cureka.com', password: 'secret' });
    expect(sessions.allocate).not.toHaveBeenCalled();
    expect(jwtService.sign).toHaveBeenCalledWith(expect.not.objectContaining({ sessionId: expect.anything() }));
  });

  it('revokes the owned session on logout and stays idempotent', async () => {
    await service.recordCookieLogout({
      sub: 'admin-1',
      email: 'superadmin@cureka.com',
      sessionId: 'session-1',
    });
    expect(sessions.revoke).toHaveBeenCalledWith('session-1', 'admin-1');
    expect(auditService.persistCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { cookieCleared: true, serverSessionRevoked: true },
      }),
    );

    sessions.revoke.mockResolvedValue(false);
    await service.recordCookieLogout({
      sub: 'admin-1',
      email: 'superadmin@cureka.com',
      sessionId: 'session-1',
    });
    expect(auditService.persistCritical).toHaveBeenLastCalledWith(
      expect.objectContaining({
        details: { cookieCleared: true, serverSessionRevoked: false },
      }),
    );
  });

  it('does not revoke a session for another admin logout', async () => {
    await service.recordCookieLogout({ sub: 'admin-2', email: 'admin@cureka.com', sessionId: 'session-9' });
    expect(sessions.revoke).not.toHaveBeenCalled();
    expect(auditService.persistCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { cookieCleared: true, serverSessionRevoked: false },
      }),
    );
  });
});
