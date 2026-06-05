import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IJwtPayload } from '../interfaces/auth.interface';

/**
 * Optional JWT guard — allows both authenticated and unauthenticated requests.
 * When a valid JWT is present, `request.user` is populated with the payload.
 * When missing or invalid, the request proceeds with `request.user` as `null`.
 *
 * Use this on routes that behave differently for logged-in vs guest users
 * (e.g. cart, product listing with personalised content).
 */
@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    // Always proceed — auth failure is handled in handleRequest
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- passport signature requires any
  handleRequest<T = IJwtPayload>(err: Error | null, user: T): T | null {
    // Suppress auth errors — unauthenticated users receive null
    if (err || !user) {
      return null as unknown as T;
    }
    return user;
  }
}
