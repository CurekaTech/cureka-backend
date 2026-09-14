import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { MasterModule } from '@modules/master/master.module';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { RefundRequestsModule } from '@modules/refund-requests/refund-requests.module';
import { RolesModule } from '@modules/roles/roles.module';
import { ShippingModule } from '@modules/shipping/shipping.module';
import { UnicommerceOrderModule } from '@modules/unicommerce/unicommerce-order.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UserEntity } from '@modules/users/entities/user.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminReturnPoliciesController } from './controllers/admin-return-policies.controller';
import { AdminReturnsController } from './controllers/admin-returns.controller';
import { ReturnsController } from './controllers/returns.controller';
import { ReturnEvidenceEntity } from './entities/return-evidence.entity';
import { ReturnPickupEntity } from './entities/return-pickup.entity';
import { ReturnQcRecordEntity } from './entities/return-qc-record.entity';
import { ReturnRequestItemEntity } from './entities/return-request-item.entity';
import { ReturnRequestEntity } from './entities/return-request.entity';
import { ReturnStatusHistoryEntity } from './entities/return-status-history.entity';
import { ReturnRequestListener } from './listeners/return-request.listener';
import { ReturnEvidencesRepository } from './repositories/return-evidences.repository';
import { ReturnPickupsRepository } from './repositories/return-pickups.repository';
import { ReturnQcRecordsRepository } from './repositories/return-qc-records.repository';
import { ReturnRequestsRepository } from './repositories/return-requests.repository';
import { ManualReturnPickupProvider } from './services/pickup-providers/manual-return-pickup.provider';
import { ShipwayReturnPickupProvider } from './services/pickup-providers/shipway-return-pickup.provider';
import { UnicommerceReturnPickupProvider } from './services/pickup-providers/unicommerce-return-pickup.provider';
import { ReturnAmountService } from './services/return-amount.service';
import { ReturnEligibilityService } from './services/return-eligibility.service';
import { ReturnEvidenceService } from './services/return-evidence.service';
import { ReturnPickupService } from './services/return-pickup.service';
import { ReturnPolicyService } from './services/return-policy.service';
import { ReturnRequestsService } from './services/return-requests.service';
import { ReturnWorkflowService } from './services/return-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReturnRequestEntity,
      ReturnRequestItemEntity,
      ReturnStatusHistoryEntity,
      ReturnEvidenceEntity,
      ReturnPickupEntity,
      ReturnQcRecordEntity,
      OrderEntity,
      OrderItemEntity,
      ProductEntity,
      ProductVariantEntity,
      UserEntity,
      AdminUserEntity,
    ]),
    MasterModule,
    RefundRequestsModule,
    RolesModule,
    UploadsModule,
    UnicommerceOrderModule,
    ShippingModule,
  ],
  controllers: [ReturnsController, AdminReturnsController, AdminReturnPoliciesController],
  providers: [
    ReturnRequestsRepository,
    ReturnEvidencesRepository,
    ReturnPickupsRepository,
    ReturnQcRecordsRepository,
    ReturnEligibilityService,
    ReturnAmountService,
    ReturnEvidenceService,
    ReturnPolicyService,
    ReturnPickupService,
    ManualReturnPickupProvider,
    ShipwayReturnPickupProvider,
    UnicommerceReturnPickupProvider,
    ReturnRequestsService,
    ReturnWorkflowService,
    ReturnRequestListener,
  ],
  exports: [ReturnRequestsService, ReturnEligibilityService],
})
export class ReturnsModule {}
