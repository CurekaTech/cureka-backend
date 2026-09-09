import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { GokwikModule } from '@modules/gokwik/gokwik.module';
import { MasterModule } from '@modules/master/master.module';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { PaymentRequestsModule } from '@modules/payment-requests/payment-requests.module';
import { UserEntity } from '@modules/users/entities/user.entity';
import { AdminRefundRequestsController } from './controllers/admin-refund-requests.controller';
import { RefundRequestHistoryEntity } from './entities/refund-request-history.entity';
import { RefundRequestEntity } from './entities/refund-request.entity';
import { RefundRequestListener } from './listeners/refund-request.listener';
import { RefundRequestsRepository } from './repositories/refund-requests.repository';
import { RefundAmountService } from './services/refund-amount.service';
import { RefundProcessorService } from './services/refund-processor.service';
import { RefundProviderResolverService } from './services/refund-provider-resolver.service';
import { RefundRequestsService } from './services/refund-request.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RefundRequestEntity,
      RefundRequestHistoryEntity,
      OrderEntity,
      UserEntity,
      AdminUserEntity,
    ]),
    forwardRef(() => GokwikModule),
    forwardRef(() => PaymentRequestsModule),
    MasterModule,
  ],
  controllers: [AdminRefundRequestsController],
  providers: [
    RefundRequestsRepository,
    RefundAmountService,
    RefundProviderResolverService,
    RefundProcessorService,
    RefundRequestsService,
    RefundRequestListener,
  ],
  exports: [RefundRequestsService],
})
export class RefundRequestsModule {}
