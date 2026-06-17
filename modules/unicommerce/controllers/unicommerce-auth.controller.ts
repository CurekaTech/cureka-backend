import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { UnicommerceAuthService } from '../services/unicommerce-auth.service';
import { UnicommerceAuthDto } from '../dto/unicommerce-auth.dto';

/**
 * Implements the Unicommerce Shipper Integration Authentication API.
 *
 * The response is sent directly (bypassing the global TransformInterceptor)
 * so the payload matches the Unicommerce spec exactly:
 *   { status: "SUCCESS" | "INVALID_CREDENTIALS", accessToken?: string }
 *
 * The issued token must be forwarded by Unicommerce as:
 *   Authorization: <accessToken>   (or apikey header, per integration config)
 */
@Controller('unicommerce')
export class UnicommerceAuthController {
  constructor(private readonly unicommerceAuthService: UnicommerceAuthService) {}

  @Post('authToken')
  async getAuthToken(
    @Body() dto: UnicommerceAuthDto,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const result = this.unicommerceAuthService.authenticate(dto);

    const statusCode = result.status === 'SUCCESS' ? HttpStatus.OK : HttpStatus.UNAUTHORIZED;
    void res.code(statusCode).send(result);
  }
}
