import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { RolesModule } from '@modules/roles/roles.module';
import { UserEntity } from './entities/user.entity';
import { UserAddressEntity } from './entities/user-address.entity';
import { UsersRepository } from './repositories/users.repository';
import { UserAddressesRepository } from './repositories/user-addresses.repository';
import { StaffUsersService } from './services/staff-users.service';
import { UsersService } from './services/users.service';
import { UserAddressesService } from './services/user-addresses.service';
import { UsersController } from './controllers/users.controller';
import { UserAddressesController } from './controllers/user-addresses.controller';
import { StaffUsersController } from './controllers/staff-users.controller';
import { AdminCustomersController } from './controllers/admin-customers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserAddressEntity]), UploadsModule, RolesModule],
  controllers: [UsersController, UserAddressesController, StaffUsersController, AdminCustomersController],
  providers: [UsersService, UsersRepository, UserAddressesService, UserAddressesRepository, StaffUsersService],
  // Export UsersRepository so PaymentRequestsModule can inject it directly for entity-level queries.
  exports: [UsersService, UserAddressesService, StaffUsersService, UsersRepository],
})
export class UsersModule {}
