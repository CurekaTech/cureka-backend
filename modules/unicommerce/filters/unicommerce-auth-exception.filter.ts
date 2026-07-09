import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

/**
 * UniCommerce evaluates auth responses with:
 *   #getAuthTokenJson.get('status').getAsString() == 'SUCCESS'
 * Any non-{status} payload (e.g. global { success: false }) breaks that expression.
 */
@Catch()
export class UnicommerceAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnicommerceAuthExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<FastifyReply>();
    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.warn(`UniCommerce auth request failed: ${message}`);
    void res.code(HttpStatus.UNAUTHORIZED).send({ status: 'INVALID_CREDENTIALS' });
  }
}
