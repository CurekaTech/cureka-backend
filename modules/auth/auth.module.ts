import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AdminUsersModule } from '@modules/admin-users/admin-users.module';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { UserAuthController } from './controllers/user-auth.controller';
import { AdminAuthService } from './services/admin-auth.service';
import { UserAuthService } from './services/user-auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [
    AdminUsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn', '7d') },
      }),
    }),
  ],
  controllers: [AdminAuthController, UserAuthController],
  providers: [AdminAuthService, UserAuthService, JwtStrategy, JwtAuthGuard, RolesGuard, Reflector],
  exports: [JwtAuthGuard, RolesGuard, JwtModule, AdminAuthService],
})
export class AuthModule {}
