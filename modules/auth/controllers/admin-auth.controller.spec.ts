import { BadRequestException } from '@nestjs/common';
import { SUPER_ADMIN_SESSION_LIMIT_MESSAGE } from '../utils/super-admin-session.util';
import { AdminAuthController } from './admin-auth.controller';

describe('AdminAuthController session cap', () => {
  const adminAuthService = {
    login: jest.fn(),
    recordCookieLogout: jest.fn(),
  };
  const controller = new AdminAuthController(adminAuthService as never);
  const response = { setCookie: jest.fn(), clearCookie: jest.fn() };
  const request = { headers: {} };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not set a cookie when login is rejected for the session cap', async () => {
    adminAuthService.login.mockRejectedValue(new BadRequestException(SUPER_ADMIN_SESSION_LIMIT_MESSAGE));
    await expect(
      controller.login(
        { email: 'superadmin@cureka.com', password: 'secret' },
        request as never,
        response as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(response.setCookie).not.toHaveBeenCalled();
  });

  it('sets the cookie only after login returns a token', async () => {
    adminAuthService.login.mockResolvedValue({ accessToken: 'signed-token' });
    await controller.login(
      { email: 'superadmin@cureka.com', password: 'secret' },
      request as never,
      response as never,
    );
    expect(response.setCookie).toHaveBeenCalledWith('admin_token', 'signed-token', expect.any(Object));
  });

  it('clears the cookie before recording logout', async () => {
    adminAuthService.recordCookieLogout.mockImplementation(async () => {
      expect(response.clearCookie).toHaveBeenCalled();
    });
    await controller.logout(
      { sub: 'admin-1', email: 'superadmin@cureka.com', sessionId: 'session-1' },
      request as never,
      response as never,
    );
    expect(adminAuthService.recordCookieLogout).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1' }),
    );
  });
});