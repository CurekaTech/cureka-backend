import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '@modules/roles/roles.module';
import { MasterModule } from '@modules/master/master.module';
import { AdminUserEntity } from './entities/admin-user.entity';
import { AdminUsersRepository } from './repositories/admin-users.repository';
import { AdminUsersService } from './services/admin-users.service';
import { AdminUsersController } from './controllers/admin-users.controller';
import { UserEntity } from '@modules/users/entities/user.entity';
import { UsersRepository } from '@modules/users/repositories/users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUserEntity, UserEntity]), RolesModule, MasterModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, AdminUsersRepository, UsersRepository],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
