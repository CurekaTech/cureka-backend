import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { sendUnicommerceAuthResponse } from '../utils/unicommerce-auth-response.util';

/**
 * UniCommerce evaluates auth responses with:
 *   #getAuthTokenJson.get('status').getAsString() == 'SUCCESS'
 * Always return HTTP 200 + { status } so their connector can parse the body.
 */
@Catch()
export class UnicommerceAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnicommerceAuthExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<FastifyReply>();
    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.warn(`UniCommerce auth request failed: ${message}`);
    sendUnicommerceAuthResponse(res, { status: 'INVALID_CREDENTIALS' });
  }
}
