import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorModule } from '@modules/doctor/doctor.module';
import { AdminConsultationsController } from './controllers/admin-consultations.controller';
import { CustomerConsultationsController } from './controllers/customer-consultations.controller';
import { DoctorConsultationsController } from './controllers/doctor-consultations.controller';
import { ConsultationDocumentEntity } from './entities/consultation-document.entity';
import { ConsultationFollowUpPolicyEntity } from './entities/consultation-follow-up-policy.entity';
import { ConsultationFollowUpRecommendationEntity } from './entities/consultation-follow-up-recommendation.entity';
import { ConsultationPaymentEntity } from './entities/consultation-payment.entity';
import { ConsultationStatusHistoryEntity } from './entities/consultation-status-history.entity';
import { ConsultationEntity } from './entities/consultation.entity';
import { PrescriptionEntity } from './entities/prescription.entity';
import { PrescriptionItemEntity } from './entities/prescription-item.entity';
import { ConsultationsRepository } from './repositories/consultations.repository';
import { ConsultationNotificationsService } from './services/consultation-notifications.service';
import { ConsultationReportsService } from './services/consultation-reports.service';
import { ConsultationsService } from './services/consultations.service';
import { FollowUpPolicyService } from './services/follow-up-policy.service';

const CONSULTATION_ENTITIES = [
  ConsultationEntity,
  ConsultationDocumentEntity,
  ConsultationPaymentEntity,
  ConsultationStatusHistoryEntity,
  ConsultationFollowUpRecommendationEntity,
  ConsultationFollowUpPolicyEntity,
  PrescriptionEntity,
  PrescriptionItemEntity,
];

@Module({
  imports: [TypeOrmModule.forFeature(CONSULTATION_ENTITIES), DoctorModule],
  controllers: [
    CustomerConsultationsController,
    DoctorConsultationsController,
    AdminConsultationsController,
  ],
  providers: [
    ConsultationsRepository,
    ConsultationsService,
    FollowUpPolicyService,
    ConsultationNotificationsService,
    ConsultationReportsService,
  ],
  exports: [ConsultationsService, FollowUpPolicyService],
})
export class ConsultationModule {}
