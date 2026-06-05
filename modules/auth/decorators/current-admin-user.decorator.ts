import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { IAdminJwtPayload } from '../interfaces/auth.interface';

export const CurrentAdminUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IAdminJwtPayload => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: IAdminJwtPayload }>();
    return request.user;
  },
);
