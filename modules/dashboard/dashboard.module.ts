import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { CouponUsageEntity } from '@modules/orders/entities/coupon-usage.entity';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { RolesModule } from '@modules/roles/roles.module';
import { UserEntity } from '@modules/users/entities/user.entity';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';

@Module({
  imports: [
    RolesModule,
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      CouponUsageEntity,
      CouponEntity,
      UserEntity,
      ProductEntity,
      ProductVariantEntity,
      BrandEntity,
      CategoryEntity,
    ]),
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
  exports: [AdminDashboardService],
})
export class DashboardModule {}
