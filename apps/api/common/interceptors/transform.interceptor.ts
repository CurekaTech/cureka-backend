import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { buildSuccessResponse, ApiResponse, RAW_RESPONSE_KEY, RESPONSE_MESSAGE_KEY } from '@packages/common';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | T> {
    const skipEnvelope = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipEnvelope) {
      return next.handle();
    }

    const message = this.reflector.getAllAndOverride<string | undefined>(RESPONSE_MESSAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(map((data) => buildSuccessResponse(data, message)));
  }
}
