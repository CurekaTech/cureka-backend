import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AdminUsersModule } from '@modules/admin-users/admin-users.module';
import { UsersModule } from '@modules/users/users.module';
import { OtpEntity } from './entities/otp.entity';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { UserAuthController } from './controllers/user-auth.controller';
import { AuthController } from './controllers/auth.controller';
import { AdminAuthService } from './services/admin-auth.service';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { OtpRepository } from './repositories/otp.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { VerifiedUserGuard } from './guards/verified-user.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [
    AdminUsersModule,
    UsersModule,
    TypeOrmModule.forFeature([OtpEntity]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn', '7d') },
      }),
    }),
  ],
  controllers: [AdminAuthController, UserAuthController, AuthController],
  providers: [
    AdminAuthService,
    AuthService,
    OtpService,
    OtpRepository,
    JwtStrategy,
    JwtAuthGuard,
    OptionalAuthGuard,
    VerifiedUserGuard,
    RolesGuard,
    Reflector,
  ],
  exports: [
    JwtAuthGuard,
    OptionalAuthGuard,
    VerifiedUserGuard,
    RolesGuard,
    JwtModule,
    AdminAuthService,
    AuthService,
  ],
})
export class AuthModule {}
