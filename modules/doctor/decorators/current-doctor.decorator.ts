import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IDoctorJwtPayload } from '../interfaces/doctor-jwt-payload.interface';

export const CurrentDoctor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IDoctorJwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: IDoctorJwtPayload }>();
    return request.user;
  },
);
