import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from './entities/admin-user.entity';
import { AdminUsersRepository } from './repositories/admin-users.repository';
import { AdminUsersService } from './services/admin-users.service';
import { AdminUsersController } from './controllers/admin-users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUserEntity])],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, AdminUsersRepository],
  exports: [AdminUsersService, AdminUsersRepository],
})
export class AdminUsersModule {}
