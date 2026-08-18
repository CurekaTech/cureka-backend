import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppCacheModule } from '@packages/cache';
import { AuthModule as CoreAuthModule } from '@packages/auth';
import { AdminUsersModule } from '@modules/admin-users/admin-users.module';
import { CheckoutModule } from '@modules/checkout/checkout.module';
import { UsersModule } from '@modules/users/users.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { OtpEntity } from './entities/otp.entity';
import { UserSessionEntity } from './entities/user-session.entity';
import { UserSessionsRepository } from './repositories/user-sessions.repository';
import { SessionService } from './services/session.service';
import { SessionCacheService } from './services/session-cache.service';
import { SessionCookieGuard } from './guards/session-cookie.guard';
import { OptionalSessionCookieGuard } from './guards/optional-session-cookie.guard';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { UserAuthController } from './controllers/user-auth.controller';
import { AuthController } from './controllers/auth.controller';
import { AdminAuthService } from './services/admin-auth.service';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { OtpRateLimitService } from './services/otp-rate-limit.service';
import { OtpRepository } from './repositories/otp.repository';
import { VerifiedUserGuard } from './guards/verified-user.guard';
import { KwikpassService } from './services/kwikpass.service';

@Global()
@Module({
  imports: [
    AppCacheModule.forRoot(),
    CoreAuthModule,
    AdminUsersModule,
    CheckoutModule,
    UsersModule,
    forwardRef(() => OrdersModule),
    UploadsModule,
    TypeOrmModule.forFeature([OtpEntity, UserSessionEntity]),
  ],
  controllers: [AdminAuthController, UserAuthController, AuthController],
  providers: [
    AdminAuthService,
    AuthService,
    OtpService,
    OtpRateLimitService,
    OtpRepository,
    UserSessionsRepository,
    SessionService,
    SessionCacheService,
    VerifiedUserGuard,
    SessionCookieGuard,
    OptionalSessionCookieGuard,
    KwikpassService,
  ],
  exports: [
    CoreAuthModule,
    AdminAuthService,
    AuthService,
    SessionService,
    SessionCacheService,
    VerifiedUserGuard,
    SessionCookieGuard,
    OptionalSessionCookieGuard,
    KwikpassService,
  ],
})
export class AuthModule {}
