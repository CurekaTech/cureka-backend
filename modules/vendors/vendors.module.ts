import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UsersModule } from '@modules/users/users.module';
import { AdminVendorsController } from './controllers/admin-vendors.controller';
import { PublicVendorsController } from './controllers/public-vendors.controller';
import { VendorEntity } from './entities/vendor.entity';
import { VendorsRepository } from './repositories/vendors.repository';
import { VendorsService } from './services/vendors.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorEntity, AdminUserEntity]),
    UsersModule,
    UploadsModule,
  ],
  controllers: [PublicVendorsController, AdminVendorsController],
  providers: [VendorsService, VendorsRepository],
  exports: [VendorsService],
})
export class VendorsModule {}
