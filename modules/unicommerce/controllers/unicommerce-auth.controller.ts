import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { UnicommerceAuthService } from '../services/unicommerce-auth.service';
import { UnicommerceAuthDto } from '../dto/unicommerce-auth.dto';
import { UnicommerceAuthExceptionFilter } from '../filters/unicommerce-auth-exception.filter';
import { sendUnicommerceAuthResponse } from '../utils/unicommerce-auth-response.util';

/**
 * Implements the Unicommerce marketplace authentication API.
 *
 * UniCommerce may call either:
 *   GET  /authToken?username=...&password=...
 *   POST /authToken  { "username": "...", "password": "..." }
 *
 * The response is sent directly (bypassing the global TransformInterceptor)
 * so the payload matches the Unicommerce spec exactly:
 *   { status: "SUCCESS" | "INVALID_CREDENTIALS", accessToken?: string }
 *
 * The issued token must be forwarded by Unicommerce as:
 *   Authorization: <accessToken>   (or apikey header, per integration config)
 */
@Controller('unicommerce')
@UseFilters(UnicommerceAuthExceptionFilter)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }),
)
export class UnicommerceAuthController {
  constructor(private readonly unicommerceAuthService: UnicommerceAuthService) {}

  @Get('authToken')
  async getAuthTokenViaQuery(
    @Query() dto: UnicommerceAuthDto,
    @Res() res: FastifyReply,
  ): Promise<void> {
    this.sendAuthResponse(res, dto);
  }

  @Post('authToken')
  async getAuthTokenViaBody(
    @Body() dto: UnicommerceAuthDto,
    @Res() res: FastifyReply,
  ): Promise<void> {
    this.sendAuthResponse(res, dto);
  }

  private sendAuthResponse(res: FastifyReply, dto: UnicommerceAuthDto): void {
    const result = this.unicommerceAuthService.authenticate(dto);
    sendUnicommerceAuthResponse(res, result);
  }
}
