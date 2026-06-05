import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IJwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- passport signature requires any
  handleRequest<T = IJwtPayload>(err: Error | null, user: T): T | null {
    if (err || !user) {
      return null as unknown as T;
    }
    return user;
  }
}
