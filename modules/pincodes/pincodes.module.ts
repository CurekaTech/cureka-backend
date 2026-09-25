import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariantPincodeEntity } from '@modules/product/entities/product-variant-pincode.entity';
import { AdminPincodesController } from './controllers/admin-pincodes.controller';
import { PublicPincodesController } from './controllers/public-pincodes.controller';
import { PincodeOfficeEntity } from './entities/pincode-office.entity';
import { PincodeEntity } from './entities/pincode.entity';
import { PincodesService } from './services/pincodes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PincodeEntity, PincodeOfficeEntity, ProductVariantPincodeEntity]),
  ],
  controllers: [AdminPincodesController, PublicPincodesController],
  providers: [PincodesService],
  exports: [PincodesService],
})
export class PincodesModule {}
