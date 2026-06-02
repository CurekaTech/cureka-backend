import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { buildSuccessResponse, ApiResponse } from '@packages/common';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const message = this.reflector.getAllAndOverride<string | undefined>(RESPONSE_MESSAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(map((data) => buildSuccessResponse(data, message)));
  }
}
