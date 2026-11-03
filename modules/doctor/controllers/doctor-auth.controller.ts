import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ResponseMessage } from '@packages/common';
import {
  getAuthCookieOptions,
  getClearAuthCookieOptions,
} from '@modules/auth/utils/auth-cookie.util';
import { parseJwtExpiresInToMilliseconds } from '@modules/auth/utils/super-admin-session.util';
import { ConfigService } from '@nestjs/config';
import { CurrentDoctor } from '../decorators/current-doctor.decorator';
import { SkipDoctorAccessChecks } from '../decorators/skip-doctor-access-checks.decorator';
import {
  AcceptLegalDocumentsDto,
  DoctorChangePasswordDto,
  DoctorLoginDto,
  DoctorRefreshDto,
} from '../dto/doctor-auth.dto';
import { DoctorAccessGuard } from '../guards/doctor-access.guard';
import { DoctorConsultationModuleEnabledGuard } from '../guards/doctor-consultation-module-enabled.guard';
import { DoctorJwtAuthGuard } from '../guards/doctor-jwt-auth.guard';
import { IDoctorJwtPayload } from '../interfaces/doctor-jwt-payload.interface';
import {
  DOCTOR_ACCESS_COOKIE,
  DOCTOR_REFRESH_COOKIE,
} from '../constants/doctor-auth.constants';
import { DoctorAuthService } from '../services/doctor-auth.service';
import { DoctorLegalDocumentsService } from '../services/doctor-legal-documents.service';
import { resolveClientIp } from '@modules/auth/utils/device-context.util';

@ApiTags('Doctor Auth')
@UseGuards(DoctorConsultationModuleEnabledGuard)
@Controller('doctor/auth')
export class DoctorAuthController {
  constructor(
    private readonly doctorAuthService: DoctorAuthService,
    private readonly legalDocumentsService: DoctorLegalDocumentsService,
    private readonly configService: ConfigService,
  ) {}

  @ResponseMessage('Login successful')
  @SkipDoctorAccessChecks()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: DoctorLoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.doctorAuthService.login(dto, req);
    this.setAuthCookies(reply, req, result.accessToken, result.refreshToken);
    return result;
  }

  @ResponseMessage('Token refreshed successfully')
  @SkipDoctorAccessChecks()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: DoctorRefreshDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken =
      dto.refreshToken ??
      (typeof req.cookies?.[DOCTOR_REFRESH_COOKIE] === 'string'
        ? req.cookies[DOCTOR_REFRESH_COOKIE]
        : undefined);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const result = await this.doctorAuthService.refresh(refreshToken);
    this.setAuthCookies(reply, req, result.accessToken, result.refreshToken);
    return result;
  }

  @ResponseMessage('Logged out successfully')
  @UseGuards(DoctorJwtAuthGuard)
  @SkipDoctorAccessChecks()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentDoctor() doctor: IDoctorJwtPayload,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.doctorAuthService.logout(doctor.sessionId, doctor.sub);
    reply.clearCookie(DOCTOR_ACCESS_COOKIE, getClearAuthCookieOptions(req));
    reply.clearCookie(DOCTOR_REFRESH_COOKIE, getClearAuthCookieOptions(req));
    return null;
  }

  @ResponseMessage('Profile retrieved successfully')
  @UseGuards(DoctorJwtAuthGuard, DoctorAccessGuard)
  @Get('me')
  me(@CurrentDoctor() doctor: IDoctorJwtPayload) {
    return this.doctorAuthService.getMe(doctor.sub);
  }

  @ResponseMessage('Password changed successfully')
  @UseGuards(DoctorJwtAuthGuard)
  @SkipDoctorAccessChecks()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentDoctor() doctor: IDoctorJwtPayload,
    @Body() dto: DoctorChangePasswordDto,
  ) {
    await this.doctorAuthService.changePassword(doctor.sub, dto);
    await this.doctorAuthService.revokeAllSessions(doctor.sub);
    return { success: true };
  }

  @ResponseMessage('Active legal documents retrieved successfully')
  @UseGuards(DoctorJwtAuthGuard)
  @SkipDoctorAccessChecks()
  @Get('legal-documents')
  activeLegalDocuments() {
    return this.legalDocumentsService.getActiveDocumentsForDoctor();
  }

  @ResponseMessage('Legal documents accepted successfully')
  @UseGuards(DoctorJwtAuthGuard)
  @SkipDoctorAccessChecks()
  @Post('legal-documents/accept')
  @HttpCode(HttpStatus.OK)
  acceptLegal(
    @CurrentDoctor() doctor: IDoctorJwtPayload,
    @Body() dto: AcceptLegalDocumentsDto,
    @Req() req: FastifyRequest,
  ) {
    return this.legalDocumentsService.acceptDocuments(doctor.sub, dto, {
      ipAddress: resolveClientIp(req),
      userAgent: req.headers['user-agent'],
    });
  }

  private setAuthCookies(
    reply: FastifyReply,
    req: FastifyRequest,
    accessToken: string,
    refreshToken: string,
  ): void {
    const accessMs =
      parseJwtExpiresInToMilliseconds(
        this.configService.get<string>('jwt.doctorJwtExpiresIn') ??
          this.configService.get<string>('jwt.accessExpiresIn') ??
          '15m',
      ) ?? 15 * 60 * 1000;
    const refreshDays = this.configService.get<number>('jwt.doctorRefreshExpiresInDays') ?? 90;
    const refreshSeconds = refreshDays * 24 * 60 * 60;

    reply.setCookie(
      DOCTOR_ACCESS_COOKIE,
      accessToken,
      getAuthCookieOptions(req, Math.floor(accessMs / 1000)),
    );
    reply.setCookie(
      DOCTOR_REFRESH_COOKIE,
      refreshToken,
      getAuthCookieOptions(req, refreshSeconds),
    );
  }
}
