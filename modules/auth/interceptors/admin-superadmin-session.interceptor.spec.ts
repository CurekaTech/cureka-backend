import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { lastValueFrom, Observable, of } from 'rxjs';
import { AdminSuperadminSessionInterceptor } from './admin-superadmin-session.interceptor';

function contextFor(user: unknown, method = 'GET', url = '/api/v1/admin/orders'): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ user, method, url, routeOptions: { url } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminSuperadminSessionInterceptor', () => {
  const sessions = { isActiveForAdmin: jest.fn() };
  const interceptor = new AdminSuperadminSessionInterceptor(sessions as never);
  const next = { handle: () => of('ok') };

  beforeEach(() => {
    sessions.isActiveForAdmin.mockReset();
  });

  it('ignores other admin users', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor({ sub: 'admin-2', email: 'admin@cureka.com', sessionId: 's1' }),
          next,
        ),
      ),
    ).resolves.toBe('ok');
    expect(sessions.isActiveForAdmin).not.toHaveBeenCalled();
  });

  it('requires an active session owned by the super admin', async () => {
    sessions.isActiveForAdmin.mockResolvedValue(true);
    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor({ sub: 'admin-1', email: 'superadmin@cureka.com', sessionId: 'session-1' }),
          next,
        ) as Observable<string>,
      ),
    ).resolves.toBe('ok');
    expect(sessions.isActiveForAdmin).toHaveBeenCalledWith('session-1', 'admin-1');
  });

  it('rejects a legacy token without sessionId', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(contextFor({ sub: 'admin-1', email: 'superadmin@cureka.com' }), next),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.isActiveForAdmin).not.toHaveBeenCalled();
  });

  it('rejects a missing, revoked, expired, or foreign session', async () => {
    sessions.isActiveForAdmin.mockResolvedValue(false);
    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor({ sub: 'admin-1', email: ' SuperAdmin@cureka.com ', sessionId: 'other-session' }),
          next,
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.isActiveForAdmin).toHaveBeenCalledWith('other-session', 'admin-1');
  });

  it('still allows logout when the session is already gone', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(
          contextFor({ sub: 'admin-1', email: 'superadmin@cureka.com' }, 'POST', '/api/v1/auth/admin/logout'),
          next,
        ),
      ),
    ).resolves.toBe('ok');
    expect(sessions.isActiveForAdmin).not.toHaveBeenCalled();
  });
});
