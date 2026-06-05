import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule as CoreAuthModule } from '@packages/auth';
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
import { VerifiedUserGuard } from './guards/verified-user.guard';

@Global()
@Module({
  imports: [
    CoreAuthModule,
    AdminUsersModule,
    UsersModule,
    TypeOrmModule.forFeature([OtpEntity]),
  ],
  controllers: [AdminAuthController, UserAuthController, AuthController],
  providers: [
    AdminAuthService,
    AuthService,
    OtpService,
    OtpRepository,
    VerifiedUserGuard,
  ],
  exports: [CoreAuthModule, AdminAuthService, AuthService, VerifiedUserGuard],
})
export class AuthModule {}
