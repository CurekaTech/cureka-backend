import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { comparePasswords, hashPassword } from '@packages/common';
import { extractDeviceContext } from '@modules/auth/utils/device-context.util';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '@modules/auth/utils/refresh-token.util';
import { DoctorChangePasswordDto, DoctorLoginDto } from '../dto/doctor-auth.dto';
import { DoctorStatus } from '../enums/doctor-status.enum';
import { IDoctorJwtPayload } from '../interfaces/doctor-jwt-payload.interface';
import { mapDoctorEntityToResponse, IDoctorResponse } from '../mappers/doctor.mapper';
import { DoctorSessionsRepository } from '../repositories/doctor-sessions.repository';
import { DoctorsRepository } from '../repositories/doctors.repository';
import { DoctorLegalDocumentsService } from './doctor-legal-documents.service';

export type DoctorAuthTokens = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
};

export type DoctorLoginResult = DoctorAuthTokens & {
  doctor: IDoctorResponse;
  mustChangePassword: boolean;
  pendingLegalAcceptances: Awaited<
    ReturnType<DoctorLegalDocumentsService['pendingLegalAcceptances']>
  >;
};

@Injectable()
export class DoctorAuthService {
  constructor(
    private readonly doctorsRepository: DoctorsRepository,
    private readonly doctorSessionsRepository: DoctorSessionsRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly legalDocumentsService: DoctorLegalDocumentsService,
  ) {}

  async login(dto: DoctorLoginDto, req: FastifyRequest): Promise<DoctorLoginResult> {
    const entity = await this.doctorsRepository.findByEmailWithPassword(dto.email);
    if (!entity) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await comparePasswords(dto.password, entity.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!entity.isActive || entity.status !== DoctorStatus.APPROVED) {
      throw new ForbiddenException('Doctor account is not active');
    }

    const device = extractDeviceContext(req);
    const tokens = await this.issueSession(entity.id, entity.category, entity.email, device);

    await this.doctorsRepository.updateById(entity.id, { lastLoginAt: new Date() });

    const doctor = await this.doctorsRepository.findById(entity.id);
    const pendingLegalAcceptances = await this.legalDocumentsService.pendingLegalAcceptances(
      entity.id,
    );

    return {
      ...tokens,
      doctor: mapDoctorEntityToResponse(doctor!),
      mustChangePassword: entity.mustChangePassword,
      pendingLegalAcceptances,
    };
  }

  async refresh(refreshToken: string): Promise<DoctorAuthTokens & { doctorId: string }> {
    const hash = hashRefreshToken(refreshToken);
    const session = await this.doctorSessionsRepository.findActiveByRefreshTokenHash(hash);
    if (!session?.doctor) {
      throw new UnauthorizedException('Invalid or revoked session');
    }
    if (session.expiresAt <= new Date()) {
      await this.doctorSessionsRepository.revoke(session.id);
      throw new UnauthorizedException('Session expired');
    }

    const newRefresh = generateRefreshToken();
    const newHash = hashRefreshToken(newRefresh);
    const expiresAt = this.buildRefreshExpiryDate();

    await this.doctorSessionsRepository.rotateHash(session.id, newHash, expiresAt);

    const doctor = session.doctor;
    const accessToken = this.signAccessToken({
      sub: doctor.id,
      type: 'doctor',
      sessionId: session.id,
      category: doctor.category,
      email: doctor.email,
    });

    return {
      accessToken,
      refreshToken: newRefresh,
      sessionId: session.id,
      doctorId: doctor.id,
    };
  }

  async logout(sessionId: string, doctorId: string): Promise<void> {
    const session = await this.doctorSessionsRepository.findById(sessionId);
    if (session && session.doctorId === doctorId) {
      await this.doctorSessionsRepository.revoke(sessionId);
    }
  }

  async changePassword(
    doctorId: string,
    dto: DoctorChangePasswordDto,
  ): Promise<void> {
    const entity = await this.doctorsRepository.findByIdWithPassword(doctorId);
    if (!entity) throw new UnauthorizedException('Doctor not found');

    const valid = await comparePasswords(dto.currentPassword, entity.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.doctorsRepository.updateById(doctorId, {
      passwordHash: await hashPassword(dto.newPassword),
      mustChangePassword: false,
    });
  }

  async revokeAllSessions(doctorId: string): Promise<number> {
    return this.doctorSessionsRepository.revokeAllForDoctor(doctorId);
  }

  async getMe(doctorId: string): Promise<IDoctorResponse> {
    const doctor = await this.doctorsRepository.findById(doctorId);
    if (!doctor) throw new UnauthorizedException('Doctor not found');
    return mapDoctorEntityToResponse(doctor);
  }

  private async issueSession(
    doctorId: string,
    category: string,
    email: string,
    device: ReturnType<typeof extractDeviceContext>,
  ): Promise<DoctorAuthTokens> {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    const expiresAt = this.buildRefreshExpiryDate();

    const session = await this.doctorSessionsRepository.create({
      doctorId,
      refreshTokenHash,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      ipAddress: device.ipAddress ?? null,
      userAgent: device.browser ? `${device.browser}${device.os ? `/${device.os}` : ''}` : null,
      lastActivity: now,
      expiresAt,
      isRevoked: false,
    });

    const accessToken = this.signAccessToken({
      sub: doctorId,
      type: 'doctor',
      sessionId: session.id,
      category,
      email,
    });

    return { accessToken, refreshToken, sessionId: session.id };
  }

  private signAccessToken(payload: IDoctorJwtPayload): string {
    const expiresIn =
      this.configService.get<string>('jwt.doctorJwtExpiresIn') ??
      this.configService.get<string>('jwt.accessExpiresIn') ??
      '15m';
    return this.jwtService.sign(payload, { expiresIn });
  }

  private buildRefreshExpiryDate(): Date {
    const days = this.configService.get<number>('jwt.doctorRefreshExpiresInDays') ?? 90;
    const ms = days * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + ms);
  }
}
