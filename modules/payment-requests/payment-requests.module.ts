import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from '@modules/orders/orders.module';
import { UsersModule } from '@modules/users/users.module';
import { PaymentRequestEntity } from './entities/payment-request.entity';
import { PaymentRequestItemEntity } from './entities/payment-request-item.entity';
import { PaymentRequestsRepository } from './repositories/payment-requests.repository';
import { PaymentRequestItemsRepository } from './repositories/payment-request-items.repository';
import { PaymentRequestsService } from './services/payment-requests.service';
import { RazorpayPaymentLinksService } from './services/razorpay-payment-links.service';
import { AdminPaymentRequestsController } from './controllers/admin-payment-requests.controller';
import { PaymentsWebhookController } from './controllers/payments-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentRequestEntity, PaymentRequestItemEntity]),
    UsersModule,
    OrdersModule,
  ],
  providers: [
    PaymentRequestsRepository,
    PaymentRequestItemsRepository,
    PaymentRequestsService,
    RazorpayPaymentLinksService,
  ],
  controllers: [AdminPaymentRequestsController, PaymentsWebhookController],
})
export class PaymentRequestsModule {}
