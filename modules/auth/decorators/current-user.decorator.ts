import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { IJwtPayload } from '../interfaces/auth.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IJwtPayload => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: IJwtPayload }>();
    return request.user;
  },
);
