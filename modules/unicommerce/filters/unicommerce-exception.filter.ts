import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  UnicommerceAuthEndpoint,
  UnicommerceUnauthorizedException,
} from '../exceptions/unicommerce-unauthorized.exception';

@Catch(UnicommerceUnauthorizedException)
export class UnicommerceUnauthorizedFilter implements ExceptionFilter {
  catch(exception: UnicommerceUnauthorizedException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();

    if (exception.endpoint === 'productsCount') {
      void res.code(HttpStatus.UNAUTHORIZED).send({});
      return;
    }

    if (exception.endpoint === 'updateInventory') {
      void res.code(HttpStatus.UNAUTHORIZED).send({
        status: 'FAILED',
        failedProductList: [],
      });
      return;
    }

    void res.code(HttpStatus.UNAUTHORIZED).send({
      message: 'Invalid User/Token',
    });
  }
}

export function resolveUnicommerceEndpoint(req: FastifyRequest): UnicommerceAuthEndpoint {
  const url = req.url ?? '';
  if (url.includes('productsCount')) return 'productsCount';
  if (url.includes('updateInventory')) return 'updateInventory';
  return 'products';
}
