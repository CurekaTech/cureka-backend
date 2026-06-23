import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UserEntity } from './entities/user.entity';
import { UserAddressEntity } from './entities/user-address.entity';
import { UsersRepository } from './repositories/users.repository';
import { UserAddressesRepository } from './repositories/user-addresses.repository';
import { UsersService } from './services/users.service';
import { UserAddressesService } from './services/user-addresses.service';
import { UsersController } from './controllers/users.controller';
import { UserAddressesController } from './controllers/user-addresses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserAddressEntity]), UploadsModule],
  controllers: [UsersController, UserAddressesController],
  providers: [UsersService, UsersRepository, UserAddressesService, UserAddressesRepository],
  exports: [UsersService, UserAddressesService],
})
export class UsersModule {}
