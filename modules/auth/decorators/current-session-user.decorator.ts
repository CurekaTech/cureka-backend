import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { IUserSessionContext } from '../interfaces/session.interface';

export const CurrentSessionUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IUserSessionContext => {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: IUserSessionContext }>();
    return request.user;
  },
);
