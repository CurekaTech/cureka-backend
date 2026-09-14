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
import { PaymentRequestsModule } from '@modules/payment-requests/payment-requests.module';
import { RefundRequestsModule } from '@modules/refund-requests/refund-requests.module';
import { ReturnsModule } from '@modules/returns/returns.module';
import { CodBlocklistModule } from '@modules/cod-blocklist/cod-blocklist.module';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { CartEntity } from './entities/cart.entity';
import { CartItemEntity } from './entities/cart-item.entity';
import { SavedForLaterItemEntity } from './entities/saved-for-later-item.entity';
import { CouponUsageEntity } from './entities/coupon-usage.entity';
import { OrderEntity } from './entities/order.entity';
import { OrderFulfillmentEventEntity } from './entities/order-fulfillment-event.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { CartController } from './controllers/cart.controller';
import { SavedForLaterController } from './controllers/saved-for-later.controller';
import { OrdersController } from './controllers/orders.controller';
import { AdminOrdersController } from './controllers/admin-orders.controller';
import { AdminOrderHistoryController } from './controllers/admin-order-history.controller';
import { AdminAbandonedCartsController } from './controllers/admin-abandoned-carts.controller';
import { CartsRepository } from './repositories/carts.repository';
import { CartItemsRepository } from './repositories/cart-items.repository';
import { SavedForLaterItemsRepository } from './repositories/saved-for-later-items.repository';
import { CouponUsagesRepository } from './repositories/coupon-usages.repository';
import { OrdersRepository } from './repositories/orders.repository';
import { OrderItemsRepository } from './repositories/order-items.repository';
import { CartService } from './services/cart.service';
import { SavedForLaterService } from './services/saved-for-later.service';
import { AdminAbandonedCartsService } from './services/admin-abandoned-carts.service';
import { CartCheckoutAdminSettingsService } from './services/cart-checkout-admin-settings.service';
import { CartPricingService } from './services/cart-pricing.service';
import { CheckoutService } from './services/checkout.service';
import { CouponCheckoutService } from './services/coupon-checkout.service';
import { OrderHistoryService } from './services/order-history.service';
import { OrdersService } from './services/orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CartEntity,
      CartItemEntity,
      SavedForLaterItemEntity,
      CouponUsageEntity,
      OrderEntity,
      OrderItemEntity,
      OrderFulfillmentEventEntity,
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
    forwardRef(() => PaymentRequestsModule),
    forwardRef(() => RefundRequestsModule),
    forwardRef(() => ReturnsModule),
    CodBlocklistModule,
  ],
  controllers: [
    CartController,
    SavedForLaterController,
    OrdersController,
    AdminOrdersController,
    AdminOrderHistoryController,
    AdminAbandonedCartsController,
  ],
  providers: [
    CartsRepository,
    CartItemsRepository,
    SavedForLaterItemsRepository,
    CouponUsagesRepository,
    OrdersRepository,
    OrderItemsRepository,
    CartService,
    SavedForLaterService,
    AdminAbandonedCartsService,
    CartCheckoutAdminSettingsService,
    CartPricingService,
    CouponCheckoutService,
    CheckoutService,
    OrdersService,
    OrderHistoryService,
  ],
  exports: [
    OrdersService,
    OrdersRepository,
    OrderItemsRepository,
    CartService,
    CheckoutService,
    CouponCheckoutService,
    CartCheckoutAdminSettingsService,
    AdminAbandonedCartsService,
  ],
})
export class OrdersModule {}
