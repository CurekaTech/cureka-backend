import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { PaymentRequestsModule } from '@modules/payment-requests/payment-requests.module';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductModule } from '@modules/product/product.module';
import { UsersModule } from '@modules/users/users.module';
import { QueueModule } from '@packages/queue';
import { SUBSCRIPTION_QUEUE } from './constants/subscription-queue.constants';
import { AdminMembershipPlansController } from './controllers/admin-membership-plans.controller';
import { AdminMembershipsController } from './controllers/admin-memberships.controller';
import { AdminProductSubscriptionsController } from './controllers/admin-product-subscriptions.controller';
import { MembershipsController } from './controllers/memberships.controller';
import { ProductSubscriptionsController } from './controllers/product-subscriptions.controller';
import { MembershipBenefitEntity } from './entities/membership-benefit.entity';
import { MembershipPaymentEntity } from './entities/membership-payment.entity';
import { MembershipPlanEntity } from './entities/membership-plan.entity';
import { ProductSubscriptionConfigEntity } from './entities/product-subscription-config.entity';
import { SubscriptionPaymentEntity } from './entities/subscription-payment.entity';
import { UserMembershipEntity } from './entities/user-membership.entity';
import { UserProductSubscriptionEntity } from './entities/user-product-subscription.entity';
import { MembershipReminderProcessor } from './processors/membership-reminder.processor';
import { MembershipRenewalProcessor } from './processors/membership-renewal.processor';
import { ProductSubscriptionReminderProcessor } from './processors/product-subscription-reminder.processor';
import { ProductSubscriptionRenewalProcessor } from './processors/product-subscription-renewal.processor';
import { MembershipBenefitsRepository } from './repositories/membership-benefits.repository';
import { MembershipPaymentsRepository } from './repositories/membership-payments.repository';
import { MembershipPlansRepository } from './repositories/membership-plans.repository';
import { ProductSubscriptionConfigsRepository } from './repositories/product-subscription-configs.repository';
import { SubscriptionPaymentsRepository } from './repositories/subscription-payments.repository';
import { UserMembershipsRepository } from './repositories/user-memberships.repository';
import { UserProductSubscriptionsRepository } from './repositories/user-product-subscriptions.repository';
import { MembershipBenefitsApplicationService } from './services/membership-benefits-application.service';
import { MembershipBenefitsService } from './services/membership-benefits.service';
import { MembershipPaymentsService } from './services/membership-payments.service';
import { MembershipPlansService } from './services/membership-plans.service';
import { MembershipPricingService } from './services/membership-pricing.service';
import { MembershipsService } from './services/memberships.service';
import { ProductSubscriptionConfigService } from './services/product-subscription-config.service';
import { ProductSubscriptionPaymentsService } from './services/product-subscription-payments.service';
import { ProductSubscriptionPricingService } from './services/product-subscription-pricing.service';
import { ProductSubscriptionsService } from './services/product-subscriptions.service';
import { SubscriptionNotificationsService } from './services/subscription-notifications.service';
import { SubscriptionPaymentLinkService } from './services/subscription-payment-link.service';
import { SubscriptionRelationLoaderService } from './services/subscription-relation-loader.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductSubscriptionConfigEntity,
      UserProductSubscriptionEntity,
      SubscriptionPaymentEntity,
      MembershipPlanEntity,
      MembershipBenefitEntity,
      UserMembershipEntity,
      MembershipPaymentEntity,
      AdminUserEntity,
      ProductEntity,
      ProductVariantEntity,
    ]),
    UsersModule,
    NotificationsModule,
    forwardRef(() => ProductModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => PaymentRequestsModule),
    QueueModule.registerQueue(
      SUBSCRIPTION_QUEUE.PRODUCT_RENEWAL,
      SUBSCRIPTION_QUEUE.PRODUCT_REMINDER,
      SUBSCRIPTION_QUEUE.MEMBERSHIP_RENEWAL,
      SUBSCRIPTION_QUEUE.MEMBERSHIP_REMINDER,
    ),
  ],
  controllers: [
    ProductSubscriptionsController,
    AdminProductSubscriptionsController,
    MembershipsController,
    AdminMembershipPlansController,
    AdminMembershipsController,
  ],
  providers: [
    ProductSubscriptionConfigsRepository,
    UserProductSubscriptionsRepository,
    SubscriptionPaymentsRepository,
    MembershipPlansRepository,
    MembershipBenefitsRepository,
    UserMembershipsRepository,
    MembershipPaymentsRepository,
    ProductSubscriptionConfigService,
    ProductSubscriptionPricingService,
    ProductSubscriptionPaymentsService,
    ProductSubscriptionsService,
    MembershipPricingService,
    MembershipPlansService,
    MembershipBenefitsService,
    MembershipPaymentsService,
    MembershipsService,
    MembershipBenefitsApplicationService,
    SubscriptionPaymentLinkService,
    SubscriptionNotificationsService,
    SubscriptionRelationLoaderService,
    ProductSubscriptionRenewalProcessor,
    ProductSubscriptionReminderProcessor,
    MembershipRenewalProcessor,
    MembershipReminderProcessor,
  ],
  exports: [
    ProductSubscriptionConfigService,
    ProductSubscriptionsService,
    MembershipsService,
    MembershipBenefitsApplicationService,
  ],
})
export class SubscriptionModule {}
