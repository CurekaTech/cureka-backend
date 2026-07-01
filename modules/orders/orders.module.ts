import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSettingsModule } from '@modules/admin-settings/admin-settings.module';
import { MasterModule } from '@modules/master/master.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UsersModule } from '@modules/users/users.module';
import { CartEntity } from './entities/cart.entity';
import { CartItemEntity } from './entities/cart-item.entity';
import { CouponUsageEntity } from './entities/coupon-usage.entity';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { CartController } from './controllers/cart.controller';
import { OrdersController } from './controllers/orders.controller';
import { CartsRepository } from './repositories/carts.repository';
import { CartItemsRepository } from './repositories/cart-items.repository';
import { CouponUsagesRepository } from './repositories/coupon-usages.repository';
import { OrdersRepository } from './repositories/orders.repository';
import { OrderItemsRepository } from './repositories/order-items.repository';
import { CartService } from './services/cart.service';
import { CartPricingService } from './services/cart-pricing.service';
import { CheckoutService } from './services/checkout.service';
import { CouponCheckoutService } from './services/coupon-checkout.service';
import { OrdersService } from './services/orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CartEntity,
      CartItemEntity,
      CouponUsageEntity,
      OrderEntity,
      OrderItemEntity,
    ]),
    AdminSettingsModule,
    MasterModule,
    UsersModule,
    UploadsModule,
  ],
  controllers: [CartController, OrdersController],
  providers: [
    CartsRepository,
    CartItemsRepository,
    CouponUsagesRepository,
    OrdersRepository,
    OrderItemsRepository,
    CartService,
    CartPricingService,
    CouponCheckoutService,
    CheckoutService,
    OrdersService,
  ],
  exports: [OrdersService, CartService, CheckoutService],
})
export class OrdersModule {}
