import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AdminUserEntity } from './entities/admin-user.entity';
import { AdminUsersRepository } from './repositories/admin-users.repository';
import { AdminUsersService } from './services/admin-users.service';
import { AdminUsersController } from './controllers/admin-users.controller';
import { JwtStrategy } from '@common/strategies/jwt.strategy';
import { RolesGuard } from '@common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminUserEntity]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn', '7d') },
      }),
    }),
  ],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, AdminUsersRepository, JwtStrategy, RolesGuard, Reflector],
  exports: [AdminUsersService, AdminUsersRepository, JwtModule],
})
export class AdminUsersModule {}
