import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { GokwikModule } from '@modules/gokwik/gokwik.module';
import { MasterModule } from '@modules/master/master.module';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { PaymentRequestsModule } from '@modules/payment-requests/payment-requests.module';
import { ReturnRequestEntity } from '@modules/returns/entities/return-request.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { AdminRefundRequestsController } from './controllers/admin-refund-requests.controller';
import { CodRefundPayoutEntity } from './entities/cod-refund-payout.entity';
import { RefundRequestHistoryEntity } from './entities/refund-request-history.entity';
import { RefundRequestEntity } from './entities/refund-request.entity';
import { RefundWalletAccountEntity } from './entities/refund-wallet-account.entity';
import { RefundWalletLedgerEntity } from './entities/refund-wallet-ledger.entity';
import { RefundRequestListener } from './listeners/refund-request.listener';
import { CodRefundPayoutsRepository } from './repositories/cod-refund-payouts.repository';
import { RefundRequestsRepository } from './repositories/refund-requests.repository';
import { RefundWalletRepository } from './repositories/refund-wallet.repository';
import { CodRefundPayoutService } from './services/cod-refund-payout.service';
import { ManualCodPayoutProvider } from './services/payout-providers/manual-cod-payout.provider';
import { RefundAmountService } from './services/refund-amount.service';
import { RefundProcessorService } from './services/refund-processor.service';
import { RefundProviderResolverService } from './services/refund-provider-resolver.service';
import { RefundRequestsService } from './services/refund-request.service';
import { RefundWalletService } from './services/refund-wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RefundRequestEntity,
      RefundRequestHistoryEntity,
      CodRefundPayoutEntity,
      RefundWalletAccountEntity,
      RefundWalletLedgerEntity,
      ReturnRequestEntity,
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
    CodRefundPayoutsRepository,
    RefundWalletRepository,
    RefundAmountService,
    RefundProviderResolverService,
    RefundProcessorService,
    RefundWalletService,
    ManualCodPayoutProvider,
    CodRefundPayoutService,
    RefundRequestsService,
    RefundRequestListener,
  ],
  exports: [
    RefundRequestsService,
    RefundAmountService,
    CodRefundPayoutService,
    RefundRequestsRepository,
  ],
})
export class RefundRequestsModule {}
