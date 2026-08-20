import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSettingsModule } from '@modules/admin-settings/admin-settings.module';
import { CheckoutModule } from '@modules/checkout/checkout.module';
import { MasterModule } from '@modules/master/master.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { ShippingModule } from '@modules/shipping/shipping.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { UnicommerceOrderModule } from '@modules/unicommerce/unicommerce-order.module';
import { UsersModule } from '@modules/users/users.module';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { CartEntity } from './entities/cart.entity';
import { CartItemEntity } from './entities/cart-item.entity';
import { CouponUsageEntity } from './entities/coupon-usage.entity';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { CartController } from './controllers/cart.controller';
import { OrdersController } from './controllers/orders.controller';
import { AdminOrdersController } from './controllers/admin-orders.controller';
import { AdminAbandonedCartsController } from './controllers/admin-abandoned-carts.controller';
import { CartsRepository } from './repositories/carts.repository';
import { CartItemsRepository } from './repositories/cart-items.repository';
import { CouponUsagesRepository } from './repositories/coupon-usages.repository';
import { OrdersRepository } from './repositories/orders.repository';
import { OrderItemsRepository } from './repositories/order-items.repository';
import { CartService } from './services/cart.service';
import { AdminAbandonedCartsService } from './services/admin-abandoned-carts.service';
import { CartCheckoutAdminSettingsService } from './services/cart-checkout-admin-settings.service';
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
      AdminUserEntity,
    ]),
    AdminSettingsModule,
    CheckoutModule,
    MasterModule,
    UsersModule,
    UploadsModule,
    ShippingModule,
    UnicommerceOrderModule,
    NotificationsModule,
    forwardRef(() => SubscriptionModule),
  ],
  controllers: [CartController, OrdersController, AdminOrdersController, AdminAbandonedCartsController],
  providers: [
    CartsRepository,
    CartItemsRepository,
    CouponUsagesRepository,
    OrdersRepository,
    OrderItemsRepository,
    CartService,
    AdminAbandonedCartsService,
    CartCheckoutAdminSettingsService,
    CartPricingService,
    CouponCheckoutService,
    CheckoutService,
    OrdersService,
  ],
  exports: [OrdersService, OrdersRepository, CartService, CheckoutService, CouponCheckoutService, CartCheckoutAdminSettingsService],
})
export class OrdersModule {}
