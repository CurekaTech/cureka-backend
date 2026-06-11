// import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
// import { FastifyReply } from 'fastify';
// import { AdminAuthService } from '../services/admin-auth.service';
// import { AdminLoginDto } from '../dto/auth.dto';
// import { JwtAuthGuard, CurrentUser, IJwtPayload } from '@packages/auth';
// import { IAdminAuthResponse } from '../interfaces/auth.interface';
// import { ResponseMessage } from '@packages/common';

// // 7 days in seconds — must match JWT expiresIn
// const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
// const ADMIN_COOKIE_NAME = 'admin_token';

// @Controller('auth/admin')
// export class AdminAuthController {
//   constructor(private readonly adminAuthService: AdminAuthService) {}

//   @ResponseMessage('Login successful')
//   @Post('login')
//   @HttpCode(HttpStatus.OK)
//   async login(
//     @Body() dto: AdminLoginDto,
//     @Res({ passthrough: true }) res: FastifyReply,
//   ): Promise<IAdminAuthResponse> {
//     const result = await this.adminAuthService.login(dto);

//     res.setCookie(ADMIN_COOKIE_NAME, result.accessToken, {
//       httpOnly: true,
//       secure: process.env['NODE_ENV'] === 'production',
//       sameSite: 'lax',
//       path: '/',
//       maxAge: COOKIE_MAX_AGE_SECONDS,
//     });

//     return result;
//   }

//   @ResponseMessage('Logged out successfully')
//   @UseGuards(JwtAuthGuard)
//   @Post('logout')
//   @HttpCode(HttpStatus.OK)
//   logout(
//     @CurrentUser() _user: IJwtPayload,
//     @Res({ passthrough: true }) res: FastifyReply,
//   ): null {
//     res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
//     return null;
//   }
// }


import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminLoginDto } from '../dto/auth.dto';
import { JwtAuthGuard, CurrentUser, IJwtPayload } from '@packages/auth';
import { IAdminAuthResponse } from '../interfaces/auth.interface';
import { ResponseMessage } from '@packages/common';
import { getAuthCookieOptions } from '../utils/auth-cookie.util';

// 7 days in seconds — must match JWT expiresIn
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const ADMIN_COOKIE_NAME = 'admin_token';

@Controller('auth/admin')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @ResponseMessage('Login successful')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<IAdminAuthResponse> {
    const result = await this.adminAuthService.login(dto);

    res.setCookie(
      ADMIN_COOKIE_NAME,
      result.accessToken,
      getAuthCookieOptions(req, COOKIE_MAX_AGE_SECONDS),
    );

    return result;
  }

  @ResponseMessage('Logged out successfully')
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @CurrentUser() _user: IJwtPayload,
    @Res({ passthrough: true }) res: FastifyReply,
  ): null {
    res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
    return null;
  }
}
