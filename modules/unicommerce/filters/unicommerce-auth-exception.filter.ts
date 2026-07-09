import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

/**
 * UniCommerce evaluates auth responses with:
 *   #getAuthTokenJson.get('status').getAsString() == 'SUCCESS'
 * Global validation errors return { success: false, ... } which breaks that expression.
 */
@Catch(BadRequestException)
export class UnicommerceAuthExceptionFilter implements ExceptionFilter {
  catch(_exception: BadRequestException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<FastifyReply>();
    void res.code(HttpStatus.UNAUTHORIZED).send({ status: 'INVALID_CREDENTIALS' });
  }
}
