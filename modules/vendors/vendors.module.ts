import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { MasterModule } from '@modules/master/master.module';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UsersModule } from '@modules/users/users.module';
import { AdminVendorsController } from './controllers/admin-vendors.controller';
import { PublicVendorsController } from './controllers/public-vendors.controller';
import { VendorCategoryHierarchyEntity } from './entities/vendor-category-hierarchy.entity';
import { VendorEntity } from './entities/vendor.entity';
import { VendorWarehouseEntity } from './entities/vendor-warehouse.entity';
import { VendorRelationsRepository } from './repositories/vendor-relations.repository';
import { VendorsRepository } from './repositories/vendors.repository';
import { VendorsService } from './services/vendors.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VendorEntity,
      VendorCategoryHierarchyEntity,
      VendorWarehouseEntity,
      BrandEntity,
      AdminUserEntity,
    ]),
    UsersModule,
    UploadsModule,
    MasterModule,
    ProductModule,
  ],
  controllers: [PublicVendorsController, AdminVendorsController],
  providers: [VendorsService, VendorsRepository, VendorRelationsRepository],
  exports: [VendorsService],
})
export class VendorsModule {}
