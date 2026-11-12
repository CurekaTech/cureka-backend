import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@modules/users/enums/user-role.enum';
import { UserStatus } from '@modules/users/enums/user-status.enum';
import { SessionCookieGuard } from './session-cookie.guard';
import { SessionService } from '../services/session.service';
import { SESSION_PURPOSE_GOKWIK_CHECKOUT } from '../constants/session-purpose.constants';

describe('SessionCookieGuard', () => {
  const sessionService = {
    resolveSessionFromToken: jest.fn(),
  };

  const guard = new SessionCookieGuard(
    sessionService as unknown as SessionService,
  );

  const makeContext = (input?: {
    authorization?: string;
    userSession?: string;
  }) => {
    const request: Record<string, unknown> = {
      headers: input?.authorization
        ? { authorization: input.authorization }
        : {},
      cookies: input?.userSession
        ? { user_session: input.userSession }
        : {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      request,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authenticates a user_session cookie', async () => {
    const ctx = makeContext({ userSession: 'sess-login' });
    sessionService.resolveSessionFromToken.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-login',
      role: UserRole.CUSTOMER,
      isGuest: false,
      isRegistered: true,
      status: UserStatus.ACTIVE,
      profile: {},
      purpose: 'login',
    });

    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(ctx.request.user).toMatchObject({ sub: 'user-1' });
  });

  it('rejects a gokwik_checkout token on storefront routes', async () => {
    const ctx = makeContext({ authorization: `Bearer ${'c'.repeat(64)}` });
    sessionService.resolveSessionFromToken.mockResolvedValue({
      sub: 'user-1',
      sessionId: 'sess-gokwik',
      role: UserRole.CUSTOMER,
      isGuest: false,
      isRegistered: true,
      status: UserStatus.ACTIVE,
      profile: {},
      purpose: SESSION_PURPOSE_GOKWIK_CHECKOUT,
    });

    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a missing session', async () => {
    const ctx = makeContext();
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
