import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from '@modules/orders/orders.module';
import { UsersModule } from '@modules/users/users.module';
import { AdminSettingsModule } from '@modules/admin-settings/admin-settings.module';
import { CheckoutModule } from '@modules/checkout/checkout.module';
import { PaymentRequestEntity } from './entities/payment-request.entity';
import { PaymentRequestItemEntity } from './entities/payment-request-item.entity';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { PaymentRequestsRepository } from './repositories/payment-requests.repository';
import { PaymentRequestItemsRepository } from './repositories/payment-request-items.repository';
import { PaymentRequestsService } from './services/payment-requests.service';
import { RazorpayPaymentLinksService } from './services/razorpay-payment-links.service';
import { CashfreePaymentService } from './services/cashfree-payment.service';
import { PaymentGatewayResolverService } from './services/payment-gateway-resolver.service';
import { AdminPaymentRequestsController } from './controllers/admin-payment-requests.controller';
import { CustomerPaymentRequestsController } from './controllers/customer-payment-requests.controller';
import { PaymentsWebhookController } from './controllers/payments-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentRequestEntity, PaymentRequestItemEntity, AdminUserEntity]),
    UsersModule,
    OrdersModule,
    AdminSettingsModule,
    CheckoutModule,
  ],
  providers: [
    PaymentRequestsRepository,
    PaymentRequestItemsRepository,
    PaymentRequestsService,
    RazorpayPaymentLinksService,
    CashfreePaymentService,
    PaymentGatewayResolverService,
  ],
  controllers: [
    AdminPaymentRequestsController,
    CustomerPaymentRequestsController,
    PaymentsWebhookController,
  ],
})
export class PaymentRequestsModule {}
