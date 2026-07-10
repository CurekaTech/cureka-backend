import { HttpStatus } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { IUnicommerceAuthResponse } from '../interfaces/unicommerce-auth.interface';

/** UniCommerce connector expects a JSON body and commonly ignores non-200 responses. */
export const UNICOMMERCE_AUTH_CONTENT_TYPE = 'application/json; charset=UTF-8';

export function sendUnicommerceAuthResponse(
  res: FastifyReply,
  body: IUnicommerceAuthResponse,
): void {
  void res
    .code(HttpStatus.OK)
    .header('Content-Type', UNICOMMERCE_AUTH_CONTENT_TYPE)
    .send(body);
}
